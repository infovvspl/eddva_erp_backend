import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, Prisma, SpInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { calcInvoiceLine, sumDecimals, toNumber } from '../common/money.util';
import { VendorsService } from '../vendors/vendors.service';
import { ItemsService } from '../items/items.service';
import {
  PurchaseInvoiceMatchService,
  MatchLineInput,
} from './purchase-invoice-match.service';
import {
  CreatePurchaseInvoiceDto,
  CreatePurchaseInvoiceItemDto,
} from './dto/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { QueryPurchaseInvoiceDto } from './dto/query-purchase-invoice.dto';

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
    private readonly vendors: VendorsService,
    private readonly items: ItemsService,
    private readonly match: PurchaseInvoiceMatchService,
  ) {}

  private async buildLines(
    instituteId: string,
    items: CreatePurchaseInvoiceItemDto[],
  ) {
    if (items.length === 0)
      throw new BadRequestException(
        'A purchase invoice must have at least one line item',
      );

    const lines: {
      item_id: number;
      po_item_id?: number;
      grn_item_id?: number;
      quantity: number;
      unit_price: number;
      cgst_rate: number;
      sgst_rate: number;
      igst_rate: number;
      cgst_amount: Prisma.Decimal;
      sgst_amount: Prisma.Decimal;
      igst_amount: Prisma.Decimal;
      line_discount: number;
      line_total: Prisma.Decimal;
    }[] = [];
    for (const line of items) {
      await this.items.assertActiveItem(instituteId, line.item_id);

      let cgst_pct = 0,
        sgst_pct = 0,
        igst_pct = 0;
      if (line.tax_code_id) {
        const taxCode = await this.prisma.spTaxCode.findFirst({
          where: { tax_code_id: line.tax_code_id, institute_id: instituteId },
        });
        if (!taxCode)
          throw new NotFoundException(
            `Tax code #${line.tax_code_id} not found`,
          );
        cgst_pct = toNumber(taxCode.cgst_pct);
        sgst_pct = toNumber(taxCode.sgst_pct);
        igst_pct = toNumber(taxCode.igst_pct);
      }

      const calc = calcInvoiceLine({
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_discount: line.line_discount ?? 0,
        cgst_pct,
        sgst_pct,
        igst_pct,
      });

      lines.push({
        item_id: line.item_id,
        po_item_id: line.po_item_id,
        grn_item_id: line.grn_item_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        cgst_rate: cgst_pct,
        sgst_rate: sgst_pct,
        igst_rate: igst_pct,
        cgst_amount: calc.cgst_amount,
        sgst_amount: calc.sgst_amount,
        igst_amount: calc.igst_amount,
        line_discount: line.line_discount ?? 0,
        line_total: calc.line_total,
      });
    }
    return lines;
  }

  private computeTotals(
    lines: {
      line_total: any;
      cgst_amount: any;
      sgst_amount: any;
      igst_amount: any;
    }[],
    orderDiscount: number,
  ) {
    const taxTotal = sumDecimals(
      lines.flatMap((l) => [l.cgst_amount, l.sgst_amount, l.igst_amount]),
    );
    const grand_total = sumDecimals(lines.map((l) => l.line_total)).sub(
      orderDiscount,
    );
    const subtotal = grand_total.add(orderDiscount).sub(taxTotal);
    return {
      subtotal: subtotal.toDecimalPlaces(2),
      tax_amount: taxTotal.toDecimalPlaces(2),
      grand_total: grand_total.toDecimalPlaces(2),
    };
  }

  private async assertLinkedDocuments(
    instituteId: string,
    vendorId: number,
    purchaseOrderId?: number,
    grnId?: number,
  ) {
    if (purchaseOrderId) {
      const po = await this.prisma.spPurchaseOrder.findFirst({
        where: { po_id: purchaseOrderId, institute_id: instituteId },
      });
      if (!po)
        throw new NotFoundException(
          `Purchase order #${purchaseOrderId} not found`,
        );
      if (po.vendor_id !== vendorId)
        throw new BadRequestException(
          `Purchase order ${po.po_number} does not belong to the selected vendor`,
        );
    }
    if (grnId) {
      const grn = await this.prisma.spGrn.findFirst({
        where: { grn_id: grnId, institute_id: instituteId },
      });
      if (!grn) throw new NotFoundException(`GRN #${grnId} not found`);
      if (grn.vendor_id !== vendorId)
        throw new BadRequestException(
          `GRN ${grn.grn_number} does not belong to the selected vendor`,
        );
      if (grn.status !== 'POSTED')
        throw new BadRequestException(
          `GRN ${grn.grn_number} is ${grn.status}; only a POSTED GRN can be invoiced against`,
        );
    }
  }

  async create(
    instituteId: string,
    dto: CreatePurchaseInvoiceDto,
    actorId: string,
  ) {
    await this.vendors.assertActiveVendor(instituteId, dto.vendor_id);
    await this.assertLinkedDocuments(
      instituteId,
      dto.vendor_id,
      dto.purchase_order_id,
      dto.grn_id,
    );

    const lines = await this.buildLines(instituteId, dto.items);
    const matchLines: MatchLineInput[] = lines.map((l) => ({
      item_id: l.item_id,
      po_item_id: l.po_item_id,
      grn_item_id: l.grn_item_id,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    }));
    await this.match.validate(this.prisma, 0, matchLines);

    const totals = this.computeTotals(lines, dto.discount ?? 0);
    const invoiceDate = new Date(dto.invoice_date);
    const financial_year = this.numbering.getFinancialYear(invoiceDate);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoice_number = await this.numbering.generateNextNumber(
        DocumentType.SP_PURCHASE_INVOICE,
        invoiceDate,
        tx,
      );
      return tx.spPurchaseInvoice.create({
        data: {
          institute_id: instituteId,
          invoice_number,
          financial_year,
          vendor_invoice_number: dto.vendor_invoice_number,
          vendor_id: dto.vendor_id,
          purchase_order_id: dto.purchase_order_id,
          grn_id: dto.grn_id,
          invoice_date: invoiceDate,
          due_date: dto.due_date ? new Date(dto.due_date) : undefined,
          discount: dto.discount ?? 0,
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          grand_total: totals.grand_total,
          created_by: actorId,
          items: { create: lines },
        },
        include: { items: true },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_INVOICE,
      entityId: String(invoice.pi_id),
      action: 'create',
    });
    return invoice;
  }

  async findAll(instituteId: string, query: QueryPurchaseInvoiceDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = {
      institute_id: instituteId,
      status: query.status,
      payment_status: query.payment_status,
      vendor_id: query.vendor_id,
      invoice_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
      OR: query.search
        ? [
            {
              invoice_number: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              vendor_invoice_number: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spPurchaseInvoice.findMany({
        where,
        include: {
          vendor: {
            select: { vendor_id: true, vendor_name: true, vendor_code: true },
          },
        },
        orderBy: { invoice_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.spPurchaseInvoice.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const invoice = await this.prisma.spPurchaseInvoice.findFirst({
      where: { pi_id: id, institute_id: instituteId },
      include: {
        vendor: true,
        purchase_order: { select: { po_id: true, po_number: true } },
        grn: { select: { grn_id: true, grn_number: true } },
        items: {
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
          },
        },
        payments: true,
      },
    });
    if (!invoice)
      throw new NotFoundException(`Purchase invoice #${id} not found`);
    return invoice;
  }

  private async getOrThrow(instituteId: string, id: number) {
    const invoice = await this.prisma.spPurchaseInvoice.findFirst({
      where: { pi_id: id, institute_id: instituteId },
    });
    if (!invoice)
      throw new NotFoundException(`Purchase invoice #${id} not found`);
    return invoice;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdatePurchaseInvoiceDto,
    actorId: string,
  ) {
    const existing = await this.getOrThrow(instituteId, id);
    if (existing.status !== SpInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase invoice ${existing.invoice_number} is ${existing.status} and is immutable`,
      );
    }

    if (dto.purchase_order_id !== undefined || dto.grn_id !== undefined) {
      await this.assertLinkedDocuments(
        instituteId,
        existing.vendor_id,
        dto.purchase_order_id ?? existing.purchase_order_id ?? undefined,
        dto.grn_id ?? existing.grn_id ?? undefined,
      );
    }

    let lines: Awaited<ReturnType<typeof this.buildLines>> | undefined;
    if (dto.items) {
      lines = await this.buildLines(instituteId, dto.items);
      const matchLines: MatchLineInput[] = lines.map((l) => ({
        item_id: l.item_id,
        po_item_id: l.po_item_id,
        grn_item_id: l.grn_item_id,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      }));
      await this.match.validate(this.prisma, id, matchLines);
    }

    const discount = dto.discount ?? toNumber(existing.discount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.spPurchaseInvoiceItem.deleteMany({ where: { pi_id: id } });
      }
      const totals = lines
        ? this.computeTotals(lines, discount)
        : {
            subtotal: existing.subtotal,
            tax_amount: existing.tax_amount,
            grand_total: sumDecimals([existing.subtotal, existing.tax_amount])
              .sub(discount)
              .toDecimalPlaces(2),
          };

      return tx.spPurchaseInvoice.update({
        where: { pi_id: id },
        data: {
          vendor_invoice_number: dto.vendor_invoice_number,
          purchase_order_id: dto.purchase_order_id,
          grn_id: dto.grn_id,
          invoice_date: dto.invoice_date
            ? new Date(dto.invoice_date)
            : undefined,
          due_date: dto.due_date ? new Date(dto.due_date) : undefined,
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
      entityType: SP_ENTITY.PURCHASE_INVOICE,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  /**
   * Posting is the critical financial operation (module spec §27): three-way
   * match, totals, and the status flip all happen inside one transaction,
   * and the flip itself is an atomic conditional UPDATE (status must still
   * be DRAFT) so a duplicate/racing post request can never post twice
   * (module spec §57 idempotency) — the loser sees affected-row-count 0 and
   * gets a 409, not a second POSTED invoice.
   */
  async post(instituteId: string, id: number, actorId: string) {
    const invoice = await this.prisma.spPurchaseInvoice.findFirst({
      where: { pi_id: id, institute_id: instituteId },
      include: { items: true },
    });
    if (!invoice)
      throw new NotFoundException(`Purchase invoice #${id} not found`);
    if (invoice.status !== SpInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase invoice ${invoice.invoice_number} is ${invoice.status}; only a DRAFT invoice can be posted`,
      );
    }

    const matchLines: MatchLineInput[] = invoice.items.map((l) => ({
      item_id: l.item_id,
      po_item_id: l.po_item_id ?? undefined,
      grn_item_id: l.grn_item_id ?? undefined,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    }));

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.match.validate(tx, id, matchLines);

      const result = await tx.spPurchaseInvoice.updateMany({
        where: { pi_id: id, status: SpInvoiceStatus.DRAFT },
        data: {
          status: SpInvoiceStatus.POSTED,
          posted_by: actorId,
          posted_at: new Date(),
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          `Purchase invoice ${invoice.invoice_number} was already posted or cancelled by a concurrent request`,
        );
      }
      return tx.spPurchaseInvoice.findUniqueOrThrow({ where: { pi_id: id } });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_INVOICE,
      entityId: String(id),
      action: 'post',
      oldStatus: invoice.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async cancel(instituteId: string, id: number, actorId: string) {
    const invoice = await this.prisma.spPurchaseInvoice.findFirst({
      where: { pi_id: id, institute_id: instituteId },
      include: { payments: true },
    });
    if (!invoice)
      throw new NotFoundException(`Purchase invoice #${id} not found`);
    if (invoice.status === SpInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        `Purchase invoice ${invoice.invoice_number} is already cancelled`,
      );
    }
    if (invoice.payments.length > 0) {
      throw new BadRequestException(
        `Purchase invoice ${invoice.invoice_number} has payments recorded against it and cannot be cancelled directly`,
      );
    }

    const updated = await this.prisma.spPurchaseInvoice.update({
      where: { pi_id: id },
      data: {
        status: SpInvoiceStatus.CANCELLED,
        cancelled_by: actorId,
        cancelled_at: new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_INVOICE,
      entityId: String(id),
      action: 'cancel',
      oldStatus: invoice.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /**
   * Hard delete. Only a DRAFT invoice — never posted, so it can hold no
   * payments and never entered the three-way-match/register data — may be
   * deleted outright. A POSTED invoice must go through cancel() instead,
   * which preserves the audit trail (module spec §46).
   */
  async remove(instituteId: string, id: number, actorId: string) {
    const invoice = await this.getOrThrow(instituteId, id);
    if (invoice.status !== SpInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase invoice ${invoice.invoice_number} is ${invoice.status}; only a DRAFT invoice can be deleted. Use cancel instead.`,
      );
    }

    await this.prisma.spPurchaseInvoice.delete({ where: { pi_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_INVOICE,
      entityId: String(id),
      action: 'delete',
      oldStatus: invoice.status,
    });
    return { success: true };
  }
}
