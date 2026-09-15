import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  Prisma,
  SpInvoiceStatus,
  SpSoStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { BusinessException } from '../common/business-exception';
import { calcInvoiceLine, sumDecimals, toNumber } from '../common/money.util';
import { CustomersService } from '../customers/customers.service';
import { ItemsService } from '../items/items.service';
import {
  CreateSalesInvoiceDto,
  CreateSalesInvoiceItemDto,
} from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { QuerySalesInvoiceDto } from './dto/query-sales-invoice.dto';

interface BuiltLine {
  item_id: number;
  so_item_id?: number;
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
}

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
    private readonly customers: CustomersService,
    private readonly items: ItemsService,
  ) {}

  private async buildLines(
    instituteId: string,
    items: CreateSalesInvoiceItemDto[],
  ): Promise<BuiltLine[]> {
    if (items.length === 0)
      throw new BadRequestException(
        'A sales invoice must have at least one line item',
      );

    const lines: BuiltLine[] = [];
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
        so_item_id: line.so_item_id,
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

  private computeTotals(lines: BuiltLine[], orderDiscount: number) {
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

  private async assertLinkedOrder(
    instituteId: string,
    customerId: number,
    salesOrderId?: number,
  ) {
    if (!salesOrderId) return;
    const so = await this.prisma.spSalesOrder.findFirst({
      where: { so_id: salesOrderId, institute_id: instituteId },
    });
    if (!so)
      throw new NotFoundException(`Sales order #${salesOrderId} not found`);
    if (so.customer_id !== customerId)
      throw new BadRequestException(
        `Sales order ${so.so_number} does not belong to the selected customer`,
      );
    if (
      !(
        [SpSoStatus.CONFIRMED, SpSoStatus.PARTIALLY_INVOICED] as SpSoStatus[]
      ).includes(so.status)
    ) {
      throw new BadRequestException(
        `Sales order ${so.so_number} is ${so.status}; only a CONFIRMED or PARTIALLY_INVOICED sales order can be invoiced against`,
      );
    }
  }

  /** Sales order line quantity matching (module spec §30): cumulative invoiced qty across non-cancelled invoices must never exceed the ordered quantity. */
  private async validateOrderQuantities(
    tx: any,
    excludeInvoiceId: number,
    lines: BuiltLine[],
  ) {
    for (const line of lines) {
      if (!line.so_item_id) continue;
      const soItem = await tx.spSalesOrderItem.findUnique({
        where: { so_item_id: line.so_item_id },
      });
      if (!soItem)
        throw new NotFoundException(
          `Sales order item #${line.so_item_id} not found`,
        );

      const alreadyInvoiced = await tx.spSalesInvoiceItem.aggregate({
        where: {
          so_item_id: line.so_item_id,
          si_id: { not: excludeInvoiceId },
          invoice: { status: { not: 'CANCELLED' } },
        },
        _sum: { quantity: true },
      });
      const invoicedSoFar = Number(alreadyInvoiced._sum.quantity ?? 0);
      const totalInvoiced = invoicedSoFar + line.quantity;
      if (totalInvoiced > Number(soItem.quantity)) {
        throw new BusinessException(
          'SALES_INVOICE_QUANTITY_EXCEEDS_ORDER',
          'Sales invoice cannot be posted because the invoiced quantity exceeds the ordered quantity.',
          {
            itemId: line.item_id,
            orderedQuantity: Number(soItem.quantity),
            invoicedQuantity: totalInvoiced,
          },
        );
      }
    }
  }

  async create(
    instituteId: string,
    dto: CreateSalesInvoiceDto,
    actorId: string,
  ) {
    await this.customers.assertActiveCustomer(instituteId, dto.customer_id);
    await this.assertLinkedOrder(
      instituteId,
      dto.customer_id,
      dto.sales_order_id,
    );

    const lines = await this.buildLines(instituteId, dto.items);
    await this.validateOrderQuantities(this.prisma, 0, lines);

    const totals = this.computeTotals(lines, dto.discount ?? 0);
    const invoiceDate = new Date(dto.invoice_date);
    const financial_year = this.numbering.getFinancialYear(invoiceDate);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoice_number = await this.numbering.generateNextNumber(
        DocumentType.SP_SALES_INVOICE,
        invoiceDate,
        tx,
      );
      return tx.spSalesInvoice.create({
        data: {
          institute_id: instituteId,
          invoice_number,
          financial_year,
          customer_id: dto.customer_id,
          sales_order_id: dto.sales_order_id,
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
      entityType: SP_ENTITY.SALES_INVOICE,
      entityId: String(invoice.si_id),
      action: 'create',
    });
    return invoice;
  }

  async findAll(instituteId: string, query: QuerySalesInvoiceDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = {
      institute_id: instituteId,
      status: query.status,
      payment_status: query.payment_status,
      customer_id: query.customer_id,
      invoice_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
      invoice_number: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spSalesInvoice.findMany({
        where,
        include: {
          customer: {
            select: {
              customer_id: true,
              customer_name: true,
              customer_code: true,
            },
          },
        },
        orderBy: { invoice_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.spSalesInvoice.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const invoice = await this.prisma.spSalesInvoice.findFirst({
      where: { si_id: id, institute_id: instituteId },
      include: {
        customer: true,
        sales_order: { select: { so_id: true, so_number: true } },
        items: {
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
          },
        },
        receipts: true,
      },
    });
    if (!invoice) throw new NotFoundException(`Sales invoice #${id} not found`);
    return invoice;
  }

  private async getOrThrow(instituteId: string, id: number) {
    const invoice = await this.prisma.spSalesInvoice.findFirst({
      where: { si_id: id, institute_id: instituteId },
    });
    if (!invoice) throw new NotFoundException(`Sales invoice #${id} not found`);
    return invoice;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateSalesInvoiceDto,
    actorId: string,
  ) {
    const existing = await this.getOrThrow(instituteId, id);
    if (existing.status !== SpInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Sales invoice ${existing.invoice_number} is ${existing.status} and is immutable`,
      );
    }

    if (dto.sales_order_id !== undefined) {
      await this.assertLinkedOrder(
        instituteId,
        existing.customer_id,
        dto.sales_order_id ?? undefined,
      );
    }

    let lines: BuiltLine[] | undefined;
    if (dto.items) {
      lines = await this.buildLines(instituteId, dto.items);
      await this.validateOrderQuantities(this.prisma, id, lines);
    }

    const discount = dto.discount ?? toNumber(existing.discount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.spSalesInvoiceItem.deleteMany({ where: { si_id: id } });
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

      return tx.spSalesInvoice.update({
        where: { si_id: id },
        data: {
          sales_order_id: dto.sales_order_id,
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
      entityType: SP_ENTITY.SALES_INVOICE,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  /**
   * Posting (module spec §33): re-validate order-quantity matching, flip
   * status atomically (idempotent under a duplicate/racing request, same as
   * purchase invoice posting), then commit each linked sales-order item's
   * invoiced_qty with the same atomic conditional-UPDATE guard GRN posting
   * uses, and recompute the sales order's status.
   */
  async post(instituteId: string, id: number, actorId: string) {
    const invoice = await this.prisma.spSalesInvoice.findFirst({
      where: { si_id: id, institute_id: instituteId },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException(`Sales invoice #${id} not found`);
    if (invoice.status !== SpInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Sales invoice ${invoice.invoice_number} is ${invoice.status}; only a DRAFT invoice can be posted`,
      );
    }

    const lines: BuiltLine[] = invoice.items.map((l) => ({
      item_id: l.item_id,
      so_item_id: l.so_item_id ?? undefined,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      cgst_rate: Number(l.cgst_rate),
      sgst_rate: Number(l.sgst_rate),
      igst_rate: Number(l.igst_rate),
      cgst_amount: l.cgst_amount,
      sgst_amount: l.sgst_amount,
      igst_amount: l.igst_amount,
      line_discount: Number(l.line_discount),
      line_total: l.line_total,
    }));

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.validateOrderQuantities(tx, id, lines);

      const result = await tx.spSalesInvoice.updateMany({
        where: { si_id: id, status: SpInvoiceStatus.DRAFT },
        data: {
          status: SpInvoiceStatus.POSTED,
          posted_by: actorId,
          posted_at: new Date(),
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          `Sales invoice ${invoice.invoice_number} was already posted or cancelled by a concurrent request`,
        );
      }

      if (invoice.sales_order_id) {
        for (const line of lines) {
          if (!line.so_item_id) continue;
          const rows = await tx.$queryRaw<{ invoiced_qty: any }[]>`
            UPDATE sp_sales_order_items
            SET invoiced_qty = invoiced_qty + ${line.quantity}::numeric
            WHERE so_item_id = ${line.so_item_id} AND invoiced_qty + ${line.quantity}::numeric <= quantity
            RETURNING invoiced_qty
          `;
          if (rows.length === 0) {
            throw new ConflictException(
              `Posting this invoice would exceed the ordered quantity for sales order item #${line.so_item_id} (concurrent invoice already recorded it)`,
            );
          }
        }

        const soItems = await tx.spSalesOrderItem.findMany({
          where: { sales_order_id: invoice.sales_order_id },
        });
        const fullyInvoiced = soItems.every(
          (i) => Number(i.invoiced_qty) >= Number(i.quantity),
        );
        await tx.spSalesOrder.update({
          where: { so_id: invoice.sales_order_id },
          data: {
            status: fullyInvoiced
              ? SpSoStatus.CLOSED
              : SpSoStatus.PARTIALLY_INVOICED,
          },
        });
      }

      return tx.spSalesInvoice.findUniqueOrThrow({ where: { si_id: id } });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_INVOICE,
      entityId: String(id),
      action: 'post',
      oldStatus: invoice.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async cancel(instituteId: string, id: number, actorId: string) {
    const invoice = await this.prisma.spSalesInvoice.findFirst({
      where: { si_id: id, institute_id: instituteId },
      include: { receipts: true },
    });
    if (!invoice) throw new NotFoundException(`Sales invoice #${id} not found`);
    if (invoice.status === SpInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        `Sales invoice ${invoice.invoice_number} is already cancelled`,
      );
    }
    if (invoice.receipts.length > 0) {
      throw new BadRequestException(
        `Sales invoice ${invoice.invoice_number} has receipts recorded against it and cannot be cancelled directly`,
      );
    }

    const updated = await this.prisma.spSalesInvoice.update({
      where: { si_id: id },
      data: {
        status: SpInvoiceStatus.CANCELLED,
        cancelled_by: actorId,
        cancelled_at: new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_INVOICE,
      entityId: String(id),
      action: 'cancel',
      oldStatus: invoice.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /**
   * Hard delete. Only a DRAFT invoice — never posted, so it can hold no
   * receipts and never entered the register data — may be deleted outright.
   * A POSTED invoice must go through cancel() instead, which preserves the
   * audit trail (module spec §46).
   */
  async remove(instituteId: string, id: number, actorId: string) {
    const invoice = await this.getOrThrow(instituteId, id);
    if (invoice.status !== SpInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Sales invoice ${invoice.invoice_number} is ${invoice.status}; only a DRAFT invoice can be deleted. Use cancel instead.`,
      );
    }

    await this.prisma.spSalesInvoice.delete({ where: { si_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_INVOICE,
      entityId: String(id),
      action: 'delete',
      oldStatus: invoice.status,
    });
    return { success: true };
  }
}
