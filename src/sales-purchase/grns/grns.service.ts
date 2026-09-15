import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, SpGrnStatus, SpPoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { WarehousesService } from '../masters/warehouses.service';
import { CreateGrnDto, CreateGrnItemDto } from './dto/create-grn.dto';
import { UpdateGrnDto } from './dto/update-grn.dto';
import { QueryGrnDto } from './dto/query-grn.dto';

@Injectable()
export class GrnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
    private readonly warehouses: WarehousesService,
  ) {}

  private validateLineShape(items: CreateGrnItemDto[]) {
    if (items.length === 0)
      throw new BadRequestException('A GRN must have at least one line item');
    for (const line of items) {
      if (line.accepted_qty + line.rejected_qty > line.received_qty) {
        throw new BadRequestException(
          `PO item #${line.po_item_id}: accepted_qty + rejected_qty cannot exceed received_qty`,
        );
      }
    }
  }

  private async assertPoReceivable(instituteId: string, poId: number) {
    const po = await this.prisma.spPurchaseOrder.findFirst({
      where: { po_id: poId, institute_id: instituteId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException(`Purchase order #${poId} not found`);
    if (
      !(
        [SpPoStatus.APPROVED, SpPoStatus.PARTIALLY_RECEIVED] as SpPoStatus[]
      ).includes(po.status)
    ) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} is ${po.status}; goods can only be received against an APPROVED or PARTIALLY_RECEIVED purchase order`,
      );
    }
    return po;
  }

  private async validateAgainstRemaining(
    po: {
      items: {
        po_item_id: number;
        item_id: number;
        quantity: any;
        received_qty: any;
      }[];
    },
    items: CreateGrnItemDto[],
  ) {
    const poItemsById = new Map(po.items.map((i) => [i.po_item_id, i]));
    const lines: Array<CreateGrnItemDto & { item_id: number }> = [];
    for (const line of items) {
      const poItem = poItemsById.get(line.po_item_id);
      if (!poItem)
        throw new NotFoundException(
          `PO item #${line.po_item_id} does not belong to this purchase order`,
        );
      const remaining = Number(poItem.quantity) - Number(poItem.received_qty);
      if (line.received_qty > remaining) {
        throw new BadRequestException(
          `Received quantity ${line.received_qty} for PO item #${line.po_item_id} exceeds the remaining ordered quantity (${remaining})`,
        );
      }
      lines.push({ ...line, item_id: poItem.item_id });
    }
    return lines;
  }

  async create(instituteId: string, dto: CreateGrnDto, actorId: string) {
    this.validateLineShape(dto.items);
    const po = await this.assertPoReceivable(
      instituteId,
      dto.purchase_order_id,
    );
    await this.warehouses.findOne(instituteId, dto.warehouse_id);
    const lines = await this.validateAgainstRemaining(po, dto.items);

    const receivedDate = new Date(dto.received_date);
    const financial_year = this.numbering.getFinancialYear(receivedDate);

    const grn = await this.prisma.$transaction(async (tx) => {
      const grn_number = await this.numbering.generateNextNumber(
        DocumentType.SP_GRN,
        receivedDate,
        tx,
      );
      return tx.spGrn.create({
        data: {
          institute_id: instituteId,
          grn_number,
          financial_year,
          purchase_order_id: dto.purchase_order_id,
          vendor_id: po.vendor_id,
          received_date: receivedDate,
          warehouse_id: dto.warehouse_id,
          created_by: actorId,
          items: {
            create: lines.map((l) => ({
              po_item_id: l.po_item_id,
              item_id: l.item_id,
              received_qty: l.received_qty,
              accepted_qty: l.accepted_qty,
              rejected_qty: l.rejected_qty,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.GRN,
      entityId: String(grn.grn_id),
      action: 'create',
    });
    return grn;
  }

  async findAll(instituteId: string, query: QueryGrnDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = {
      institute_id: instituteId,
      status: query.status,
      vendor_id: query.vendor_id,
      purchase_order_id: query.purchase_order_id,
      grn_number: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
      received_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spGrn.findMany({
        where,
        include: {
          vendor: { select: { vendor_id: true, vendor_name: true } },
          purchase_order: { select: { po_id: true, po_number: true } },
        },
        orderBy: { received_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.spGrn.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const grn = await this.prisma.spGrn.findFirst({
      where: { grn_id: id, institute_id: instituteId },
      include: {
        vendor: true,
        warehouse: true,
        purchase_order: { select: { po_id: true, po_number: true } },
        items: {
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
          },
        },
      },
    });
    if (!grn) throw new NotFoundException(`GRN #${id} not found`);
    return grn;
  }

  private async getDraftOrThrow(instituteId: string, id: number) {
    const grn = await this.prisma.spGrn.findFirst({
      where: { grn_id: id, institute_id: instituteId },
    });
    if (!grn) throw new NotFoundException(`GRN #${id} not found`);
    return grn;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateGrnDto,
    actorId: string,
  ) {
    const existing = await this.getDraftOrThrow(instituteId, id);
    if (existing.status !== SpGrnStatus.DRAFT) {
      throw new BadRequestException(
        `GRN ${existing.grn_number} is ${existing.status} and can no longer be edited`,
      );
    }

    if (dto.warehouse_id)
      await this.warehouses.findOne(instituteId, dto.warehouse_id);

    let lines: Array<CreateGrnItemDto & { item_id: number }> | undefined;
    if (dto.items) {
      this.validateLineShape(dto.items);
      const po = await this.prisma.spPurchaseOrder.findFirst({
        where: { po_id: existing.purchase_order_id },
        include: { items: true },
      });
      lines = await this.validateAgainstRemaining(po!, dto.items);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.spGrnItem.deleteMany({ where: { grn_id: id } });
      }
      return tx.spGrn.update({
        where: { grn_id: id },
        data: {
          received_date: dto.received_date
            ? new Date(dto.received_date)
            : undefined,
          warehouse_id: dto.warehouse_id,
          ...(lines
            ? {
                items: {
                  create: lines.map((l) => ({
                    po_item_id: l.po_item_id,
                    item_id: l.item_id,
                    received_qty: l.received_qty,
                    accepted_qty: l.accepted_qty,
                    rejected_qty: l.rejected_qty,
                  })),
                },
              }
            : {}),
        },
        include: { items: true },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.GRN,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  /**
   * Posting commits received quantities against the PO transactionally and
   * concurrency-safely: each PO item's received_qty is incremented with a
   * single atomic UPDATE whose WHERE clause re-checks the "does not exceed
   * ordered quantity" invariant against the row's *current* value under its
   * own row lock — the same atomic-guard pattern NumberingService/
   * InventoryStockLedgerService use, so two GRNs racing to receive the last
   * remaining units of a PO item can't both succeed (module spec §39).
   */
  async post(instituteId: string, id: number, actorId: string) {
    const grn = await this.prisma.spGrn.findFirst({
      where: { grn_id: id, institute_id: instituteId },
      include: { items: true },
    });
    if (!grn) throw new NotFoundException(`GRN #${id} not found`);
    if (grn.status !== SpGrnStatus.DRAFT) {
      throw new BadRequestException(
        `GRN ${grn.grn_number} is ${grn.status}; only a DRAFT GRN can be posted`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of grn.items) {
        const rows = await tx.$queryRaw<{ received_qty: any }[]>`
          UPDATE sp_purchase_order_items
          SET received_qty = received_qty + ${line.received_qty}::numeric
          WHERE po_item_id = ${line.po_item_id} AND received_qty + ${line.received_qty}::numeric <= quantity
          RETURNING received_qty
        `;
        if (rows.length === 0) {
          throw new ConflictException(
            `Posting this GRN would exceed the remaining ordered quantity for PO item #${line.po_item_id} (concurrent receipt already recorded it)`,
          );
        }
      }

      const poItems = await tx.spPurchaseOrderItem.findMany({
        where: { purchase_order_id: grn.purchase_order_id },
      });
      const fullyReceived = poItems.every(
        (i) => Number(i.received_qty) >= Number(i.quantity),
      );
      await tx.spPurchaseOrder.update({
        where: { po_id: grn.purchase_order_id },
        data: {
          status: fullyReceived
            ? SpPoStatus.CLOSED
            : SpPoStatus.PARTIALLY_RECEIVED,
        },
      });

      return tx.spGrn.update({
        where: { grn_id: id },
        data: { status: SpGrnStatus.POSTED },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.GRN,
      entityId: String(id),
      action: 'post',
      oldStatus: grn.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async cancel(instituteId: string, id: number, actorId: string) {
    const grn = await this.getDraftOrThrow(instituteId, id);
    if (grn.status !== SpGrnStatus.DRAFT) {
      throw new BadRequestException(
        `GRN ${grn.grn_number} is ${grn.status}; a posted GRN is immutable and cannot be cancelled — reverse it via a correction workflow instead`,
      );
    }

    const updated = await this.prisma.spGrn.update({
      where: { grn_id: id },
      data: {
        status: SpGrnStatus.CANCELLED,
        cancelled_by: actorId,
        cancelled_at: new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.GRN,
      entityId: String(id),
      action: 'cancel',
      oldStatus: grn.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /**
   * Hard delete. Only a DRAFT GRN — one that has never been posted, so it
   * never touched PO received_qty and there is nothing to reverse — may be
   * deleted outright. A POSTED GRN must go through cancel()'s immutability
   * rule instead (which currently refuses it entirely, pending a proper
   * reversal workflow).
   */
  async remove(instituteId: string, id: number, actorId: string) {
    const grn = await this.getDraftOrThrow(instituteId, id);
    if (grn.status !== SpGrnStatus.DRAFT) {
      throw new BadRequestException(
        `GRN ${grn.grn_number} is ${grn.status}; only a DRAFT GRN can be deleted`,
      );
    }
    const invoiceCount = await this.prisma.spPurchaseInvoice.count({
      where: { grn_id: id },
    });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `GRN ${grn.grn_number} has purchase invoices referencing it and cannot be deleted.`,
      );
    }

    await this.prisma.spGrn.delete({ where: { grn_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.GRN,
      entityId: String(id),
      action: 'delete',
      oldStatus: grn.status,
    });
    return { success: true };
  }
}
