import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  Prisma,
  SpPoApprovalAction,
  SpPoStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import {
  SalesPurchaseAccessService,
  isSpAdmin,
} from '../common/sales-purchase-access.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  buildMeta,
  parsePagination,
  parseSortOrder,
} from '../common/pagination.util';
import { calcOrderLine, sumDecimals, toNumber } from '../common/money.util';
import { VendorsService } from '../vendors/vendors.service';
import { WarehousesService } from '../masters/warehouses.service';
import { ItemsService } from '../items/items.service';
import { ApprovalRulesService } from './approval-rules.service';
import {
  CreatePurchaseOrderDto,
  CreatePurchaseOrderItemDto,
} from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';

const PO_SORT_FIELDS = [
  'po_date',
  'po_number',
  'grand_total',
  'created_at',
] as const;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
    private readonly access: SalesPurchaseAccessService,
    private readonly vendors: VendorsService,
    private readonly warehouses: WarehousesService,
    private readonly items: ItemsService,
    private readonly approvalRules: ApprovalRulesService,
  ) {}

  private async buildLines(
    instituteId: string,
    items: CreatePurchaseOrderItemDto[],
  ) {
    if (items.length === 0)
      throw new BadRequestException(
        'A purchase order must have at least one line item',
      );

    const lines: {
      item_id: number;
      quantity: number;
      unit_price: number;
      tax_code_id?: number;
      line_discount: number;
      line_tax_amount: Prisma.Decimal;
      line_total: Prisma.Decimal;
    }[] = [];
    for (const line of items) {
      await this.items.assertActiveItem(instituteId, line.item_id);

      let taxPct = 0;
      if (line.tax_code_id) {
        const taxCode = await this.prisma.spTaxCode.findFirst({
          where: { tax_code_id: line.tax_code_id, institute_id: instituteId },
        });
        if (!taxCode)
          throw new NotFoundException(
            `Tax code #${line.tax_code_id} not found`,
          );
        taxPct =
          toNumber(taxCode.cgst_pct) +
          toNumber(taxCode.sgst_pct) +
          toNumber(taxCode.igst_pct);
      }

      const calc = calcOrderLine({
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_discount: line.line_discount ?? 0,
        tax_pct: taxPct,
      });

      lines.push({
        item_id: line.item_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_code_id: line.tax_code_id,
        line_discount: line.line_discount ?? 0,
        line_tax_amount: calc.line_tax_amount,
        line_total: calc.line_total,
      });
    }
    return lines;
  }

  private computeOrderTotals(
    lines: { line_total: any; line_tax_amount: any }[],
    orderDiscount: number,
  ) {
    const subtotal = sumDecimals(lines.map((l) => l.line_total)).sub(
      sumDecimals(lines.map((l) => l.line_tax_amount)),
    );
    const tax_amount = sumDecimals(lines.map((l) => l.line_tax_amount));
    const grand_total = sumDecimals(lines.map((l) => l.line_total)).sub(
      orderDiscount,
    );
    return {
      subtotal: subtotal.toDecimalPlaces(2),
      tax_amount: tax_amount.toDecimalPlaces(2),
      grand_total: grand_total.toDecimalPlaces(2),
    };
  }

  async create(
    instituteId: string,
    dto: CreatePurchaseOrderDto,
    actorId: string,
  ) {
    await this.vendors.assertActiveVendor(instituteId, dto.vendor_id);
    await this.warehouses.findOne(instituteId, dto.warehouse_id);

    const lines = await this.buildLines(instituteId, dto.items);
    const totals = this.computeOrderTotals(lines, dto.discount ?? 0);
    const poDate = new Date(dto.po_date);
    const financial_year = this.numbering.getFinancialYear(poDate);

    const po = await this.prisma.$transaction(async (tx) => {
      const po_number = await this.numbering.generateNextNumber(
        DocumentType.SP_PURCHASE_ORDER,
        poDate,
        tx,
      );
      return tx.spPurchaseOrder.create({
        data: {
          institute_id: instituteId,
          po_number,
          financial_year,
          vendor_id: dto.vendor_id,
          po_date: poDate,
          expected_delivery_date: dto.expected_delivery_date
            ? new Date(dto.expected_delivery_date)
            : undefined,
          warehouse_id: dto.warehouse_id,
          discount: dto.discount ?? 0,
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          grand_total: totals.grand_total,
          created_by: actorId,
          items: { create: lines },
        },
        include: { items: true, vendor: true, warehouse: true },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(po.po_id),
      action: 'create',
      newStatus: po.status,
    });
    return po;
  }

  async findAll(instituteId: string, query: QueryPurchaseOrderDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = PO_SORT_FIELDS.includes(query.sortBy as any)
      ? (query.sortBy as (typeof PO_SORT_FIELDS)[number])
      : 'po_date';
    const sortOrder = parseSortOrder(query.sortOrder);

    const where = {
      institute_id: instituteId,
      status: query.status,
      vendor_id: query.vendor_id,
      po_number: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
      po_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spPurchaseOrder.findMany({
        where,
        include: {
          vendor: {
            select: { vendor_id: true, vendor_name: true, vendor_code: true },
          },
          warehouse: { select: { warehouse_id: true, name: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.spPurchaseOrder.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const po = await this.prisma.spPurchaseOrder.findFirst({
      where: { po_id: id, institute_id: instituteId },
      include: {
        vendor: true,
        warehouse: true,
        items: {
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
            tax_code: true,
          },
        },
        approvals: { orderBy: { action_at: 'asc' } },
      },
    });
    if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
    return po;
  }

  private async getDraftOrThrow(instituteId: string, id: number) {
    const po = await this.prisma.spPurchaseOrder.findFirst({
      where: { po_id: id, institute_id: instituteId },
    });
    if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
    return po;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdatePurchaseOrderDto,
    actorId: string,
  ) {
    const existing = await this.getDraftOrThrow(instituteId, id);
    if (existing.status !== SpPoStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase order ${existing.po_number} is ${existing.status} and can no longer be edited directly. Cancel and recreate, or use the approval workflow.`,
      );
    }

    if (dto.vendor_id)
      await this.vendors.assertActiveVendor(instituteId, dto.vendor_id);
    if (dto.warehouse_id)
      await this.warehouses.findOne(instituteId, dto.warehouse_id);

    const lines = dto.items
      ? await this.buildLines(instituteId, dto.items)
      : undefined;
    const discount = dto.discount ?? toNumber(existing.discount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.spPurchaseOrderItem.deleteMany({
          where: { purchase_order_id: id },
        });
      }
      const totals = lines
        ? this.computeOrderTotals(lines, discount)
        : {
            subtotal: existing.subtotal,
            tax_amount: existing.tax_amount,
            grand_total: sumDecimals([existing.subtotal, existing.tax_amount])
              .sub(discount)
              .toDecimalPlaces(2),
          };

      return tx.spPurchaseOrder.update({
        where: { po_id: id },
        data: {
          vendor_id: dto.vendor_id,
          po_date: dto.po_date ? new Date(dto.po_date) : undefined,
          expected_delivery_date: dto.expected_delivery_date
            ? new Date(dto.expected_delivery_date)
            : undefined,
          warehouse_id: dto.warehouse_id,
          discount,
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          grand_total: totals.grand_total,
          ...(lines ? { items: { create: lines } } : {}),
        },
        include: { items: true },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  async submit(instituteId: string, id: number, actorId: string) {
    const po = await this.getDraftOrThrow(instituteId, id);
    if (po.status !== SpPoStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} is ${po.status}; only a DRAFT purchase order can be submitted`,
      );
    }

    const updated = await this.prisma.spPurchaseOrder.update({
      where: { po_id: id },
      data: { status: SpPoStatus.PENDING_APPROVAL, submitted_at: new Date() },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(id),
      action: 'submit',
      oldStatus: po.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async approve(
    instituteId: string,
    id: number,
    actor: SalesPurchasePlatformUser,
    remarks?: string,
  ) {
    const po = await this.prisma.spPurchaseOrder.findFirst({
      where: { po_id: id, institute_id: instituteId },
      include: {
        approvals: {
          where: { action: SpPoApprovalAction.APPROVED },
          orderBy: { action_at: 'asc' },
        },
      },
    });
    if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
    if (po.status !== SpPoStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} is ${po.status}; it must be PENDING_APPROVAL to be approved`,
      );
    }

    const requiredRules = await this.approvalRules.resolveRequiredRules(
      instituteId,
      toNumber(po.grand_total),
    );
    const satisfiedCount = po.approvals.length;

    if (requiredRules.length > 0 && !isSpAdmin(actor)) {
      const nextRule = requiredRules[satisfiedCount];
      if (nextRule?.approver_role_id) {
        const actorRoleId = await this.access.resolveRoleId(actor);
        if (actorRoleId !== nextRule.approver_role_id) {
          throw new ForbiddenException(
            `This purchase order's next approval tier ("${nextRule.name}") requires a different assigned role`,
          );
        }
      }
    }

    const isFinalApproval = satisfiedCount + 1 >= requiredRules.length;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.spPoApproval.create({
        data: {
          po_id: id,
          approver_id: actor.eddva_user_id,
          action: SpPoApprovalAction.APPROVED,
          remarks,
        },
      });

      if (isFinalApproval) {
        return tx.spPurchaseOrder.update({
          where: { po_id: id },
          data: {
            status: SpPoStatus.APPROVED,
            approved_by: actor.eddva_user_id,
            approved_at: new Date(),
          },
        });
      }
      return tx.spPurchaseOrder.findUniqueOrThrow({ where: { po_id: id } });
    });

    await this.audit.log({
      userId: actor.eddva_user_id,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(id),
      action: 'approve',
      oldStatus: po.status,
      newStatus: updated.status,
      metadata: { tier: satisfiedCount + 1, of: requiredRules.length || 1 },
    });
    return updated;
  }

  async reject(
    instituteId: string,
    id: number,
    actor: SalesPurchasePlatformUser,
    reason: string,
  ) {
    const po = await this.getDraftOrThrow(instituteId, id);
    if (po.status !== SpPoStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} is ${po.status}; it must be PENDING_APPROVAL to be rejected`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.spPoApproval.create({
        data: {
          po_id: id,
          approver_id: actor.eddva_user_id,
          action: SpPoApprovalAction.REJECTED,
          remarks: reason,
        },
      });
      return tx.spPurchaseOrder.update({
        where: { po_id: id },
        data: {
          status: SpPoStatus.REJECTED,
          rejected_by: actor.eddva_user_id,
          rejected_at: new Date(),
          rejection_reason: reason,
        },
      });
    });

    await this.audit.log({
      userId: actor.eddva_user_id,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(id),
      action: 'reject',
      oldStatus: po.status,
      newStatus: updated.status,
      reason,
    });
    return updated;
  }

  async cancel(instituteId: string, id: number, actorId: string) {
    const po = await this.getDraftOrThrow(instituteId, id);
    if (
      (
        [
          SpPoStatus.CLOSED,
          SpPoStatus.CANCELLED,
          SpPoStatus.REJECTED,
        ] as SpPoStatus[]
      ).includes(po.status)
    ) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} is already ${po.status}`,
      );
    }
    const grnCount = await this.prisma.spGrn.count({
      where: { purchase_order_id: id, status: { not: 'CANCELLED' } },
    });
    if (grnCount > 0) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} has goods receipt notes recorded against it and cannot be cancelled`,
      );
    }
    // A purchase invoice can be linked directly to a PO with no GRN in
    // between (see assertLinkedDocuments in purchase-invoices.service.ts),
    // so the GRN check above alone isn't sufficient — this was previously
    // missed, allowing a PO to be cancelled while a live invoice still
    // referenced it.
    const invoiceCount = await this.prisma.spPurchaseInvoice.count({
      where: { purchase_order_id: id, status: { not: 'CANCELLED' } },
    });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} has purchase invoices recorded against it and cannot be cancelled`,
      );
    }

    const updated = await this.prisma.spPurchaseOrder.update({
      where: { po_id: id },
      data: {
        status: SpPoStatus.CANCELLED,
        cancelled_by: actorId,
        cancelled_at: new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(id),
      action: 'cancel',
      oldStatus: po.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /**
   * Hard delete. Only a DRAFT purchase order — one that has never been
   * submitted, so nothing can legitimately depend on it yet — may be
   * deleted outright. Anything past DRAFT must go through cancel(), which
   * preserves the audit trail instead of erasing it (module spec §46).
   */
  async remove(instituteId: string, id: number, actorId: string) {
    const po = await this.getDraftOrThrow(instituteId, id);
    if (po.status !== SpPoStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} is ${po.status}; only a DRAFT purchase order can be deleted. Use cancel instead.`,
      );
    }
    const invoiceCount = await this.prisma.spPurchaseInvoice.count({
      where: { purchase_order_id: id },
    });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `Purchase order ${po.po_number} has purchase invoices referencing it and cannot be deleted.`,
      );
    }

    await this.prisma.spPurchaseOrder.delete({ where: { po_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_ORDER,
      entityId: String(id),
      action: 'delete',
      oldStatus: po.status,
    });
    return { success: true };
  }
}
