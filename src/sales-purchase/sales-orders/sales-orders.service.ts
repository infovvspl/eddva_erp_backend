import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, Prisma, SpSoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  buildMeta,
  parsePagination,
  parseSortOrder,
} from '../common/pagination.util';
import { calcOrderLine, sumDecimals, toNumber } from '../common/money.util';
import { CustomersService } from '../customers/customers.service';
import { ItemsService } from '../items/items.service';
import {
  CreateSalesOrderDto,
  CreateSalesOrderItemDto,
} from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { QuerySalesOrderDto } from './dto/query-sales-order.dto';

const SO_SORT_FIELDS = [
  'so_date',
  'so_number',
  'grand_total',
  'created_at',
] as const;

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
    private readonly customers: CustomersService,
    private readonly items: ItemsService,
  ) {}

  private async buildLines(
    instituteId: string,
    items: CreateSalesOrderItemDto[],
  ) {
    if (items.length === 0)
      throw new BadRequestException(
        'A sales order must have at least one line item',
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

  private computeTotals(
    lines: { line_total: any; line_tax_amount: any }[],
    orderDiscount: number,
  ) {
    const tax_amount = sumDecimals(lines.map((l) => l.line_tax_amount));
    const grand_total = sumDecimals(lines.map((l) => l.line_total)).sub(
      orderDiscount,
    );
    const subtotal = grand_total.add(orderDiscount).sub(tax_amount);
    return {
      subtotal: subtotal.toDecimalPlaces(2),
      tax_amount: tax_amount.toDecimalPlaces(2),
      grand_total: grand_total.toDecimalPlaces(2),
    };
  }

  async create(instituteId: string, dto: CreateSalesOrderDto, actorId: string) {
    await this.customers.assertActiveCustomer(instituteId, dto.customer_id);
    const lines = await this.buildLines(instituteId, dto.items);
    const totals = this.computeTotals(lines, dto.discount ?? 0);
    const soDate = new Date(dto.so_date);
    const financial_year = this.numbering.getFinancialYear(soDate);

    const so = await this.prisma.$transaction(async (tx) => {
      const so_number = await this.numbering.generateNextNumber(
        DocumentType.SP_SALES_ORDER,
        soDate,
        tx,
      );
      return tx.spSalesOrder.create({
        data: {
          institute_id: instituteId,
          so_number,
          financial_year,
          customer_id: dto.customer_id,
          so_date: soDate,
          delivery_date: dto.delivery_date
            ? new Date(dto.delivery_date)
            : undefined,
          discount: dto.discount ?? 0,
          subtotal: totals.subtotal,
          tax_amount: totals.tax_amount,
          grand_total: totals.grand_total,
          created_by: actorId,
          items: { create: lines },
        },
        include: { items: true, customer: true },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_ORDER,
      entityId: String(so.so_id),
      action: 'create',
    });
    return so;
  }

  async findAll(instituteId: string, query: QuerySalesOrderDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = SO_SORT_FIELDS.includes(query.sortBy as any)
      ? (query.sortBy as (typeof SO_SORT_FIELDS)[number])
      : 'so_date';
    const sortOrder = parseSortOrder(query.sortOrder);

    const where = {
      institute_id: instituteId,
      status: query.status,
      customer_id: query.customer_id,
      so_number: query.search
        ? { contains: query.search, mode: 'insensitive' as const }
        : undefined,
      so_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spSalesOrder.findMany({
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
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.spSalesOrder.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const so = await this.prisma.spSalesOrder.findFirst({
      where: { so_id: id, institute_id: instituteId },
      include: {
        customer: true,
        items: {
          include: {
            item: {
              select: { item_id: true, item_code: true, item_name: true },
            },
            tax_code: true,
          },
        },
      },
    });
    if (!so) throw new NotFoundException(`Sales order #${id} not found`);
    return so;
  }

  private async getOrThrow(instituteId: string, id: number) {
    const so = await this.prisma.spSalesOrder.findFirst({
      where: { so_id: id, institute_id: instituteId },
    });
    if (!so) throw new NotFoundException(`Sales order #${id} not found`);
    return so;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateSalesOrderDto,
    actorId: string,
  ) {
    const existing = await this.getOrThrow(instituteId, id);
    if (existing.status !== SpSoStatus.DRAFT) {
      throw new BadRequestException(
        `Sales order ${existing.so_number} is ${existing.status} and can no longer be edited directly`,
      );
    }
    if (dto.customer_id)
      await this.customers.assertActiveCustomer(instituteId, dto.customer_id);

    const lines = dto.items
      ? await this.buildLines(instituteId, dto.items)
      : undefined;
    const discount = dto.discount ?? toNumber(existing.discount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.spSalesOrderItem.deleteMany({ where: { sales_order_id: id } });
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

      return tx.spSalesOrder.update({
        where: { so_id: id },
        data: {
          customer_id: dto.customer_id,
          so_date: dto.so_date ? new Date(dto.so_date) : undefined,
          delivery_date: dto.delivery_date
            ? new Date(dto.delivery_date)
            : undefined,
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
      entityType: SP_ENTITY.SALES_ORDER,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  async confirm(instituteId: string, id: number, actorId: string) {
    const so = await this.getOrThrow(instituteId, id);
    if (so.status !== SpSoStatus.DRAFT) {
      throw new BadRequestException(
        `Sales order ${so.so_number} is ${so.status}; only a DRAFT sales order can be confirmed`,
      );
    }
    const updated = await this.prisma.spSalesOrder.update({
      where: { so_id: id },
      data: { status: SpSoStatus.CONFIRMED, confirmed_at: new Date() },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_ORDER,
      entityId: String(id),
      action: 'confirm',
      oldStatus: so.status,
      newStatus: updated.status,
    });
    return updated;
  }

  async cancel(instituteId: string, id: number, actorId: string) {
    const so = await this.getOrThrow(instituteId, id);
    if (
      ([SpSoStatus.CLOSED, SpSoStatus.CANCELLED] as SpSoStatus[]).includes(
        so.status,
      )
    ) {
      throw new BadRequestException(
        `Sales order ${so.so_number} is already ${so.status}`,
      );
    }
    const invoiceCount = await this.prisma.spSalesInvoice.count({
      where: { sales_order_id: id, status: { not: 'CANCELLED' } },
    });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `Sales order ${so.so_number} has invoices recorded against it and cannot be cancelled`,
      );
    }

    const updated = await this.prisma.spSalesOrder.update({
      where: { so_id: id },
      data: {
        status: SpSoStatus.CANCELLED,
        cancelled_by: actorId,
        cancelled_at: new Date(),
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_ORDER,
      entityId: String(id),
      action: 'cancel',
      oldStatus: so.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /**
   * Hard delete. Only a DRAFT sales order — never confirmed, so nothing can
   * legitimately depend on it yet — may be deleted outright. Anything past
   * DRAFT must go through cancel() to preserve the audit trail.
   */
  async remove(instituteId: string, id: number, actorId: string) {
    const so = await this.getOrThrow(instituteId, id);
    if (so.status !== SpSoStatus.DRAFT) {
      throw new BadRequestException(
        `Sales order ${so.so_number} is ${so.status}; only a DRAFT sales order can be deleted. Use cancel instead.`,
      );
    }
    const invoiceCount = await this.prisma.spSalesInvoice.count({
      where: { sales_order_id: id },
    });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `Sales order ${so.so_number} has invoices referencing it and cannot be deleted.`,
      );
    }

    await this.prisma.spSalesOrder.delete({ where: { so_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_ORDER,
      entityId: String(id),
      action: 'delete',
      oldStatus: so.status,
    });
    return { success: true };
  }
}
