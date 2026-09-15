import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SpInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { resolvePaymentStatus } from '../common/payment-status.util';
import { CreateSalesReceiptDto } from './dto/create-sales-receipt.dto';
import { UpdateSalesReceiptDto } from './dto/update-sales-receipt.dto';
import { QuerySalesReceiptDto } from './dto/query-sales-receipt.dto';

@Injectable()
export class SalesReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  /** Same atomic conditional-UPDATE guard as purchase payments — see PurchasePaymentsService. */
  async create(
    instituteId: string,
    dto: CreateSalesReceiptDto,
    actorId: string,
  ) {
    const invoice = await this.prisma.spSalesInvoice.findFirst({
      where: { si_id: dto.si_id, institute_id: instituteId },
    });
    if (!invoice)
      throw new NotFoundException(`Sales invoice #${dto.si_id} not found`);
    if (invoice.status !== SpInvoiceStatus.POSTED) {
      throw new BadRequestException(
        `Sales invoice ${invoice.invoice_number} is ${invoice.status}; receipts can only be recorded against a POSTED invoice`,
      );
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ paid_amount: any; grand_total: any }[]>`
        UPDATE sp_sales_invoices
        SET paid_amount = paid_amount + ${dto.amount}::numeric
        WHERE si_id = ${dto.si_id} AND status = 'POSTED' AND paid_amount + ${dto.amount}::numeric <= grand_total
        RETURNING paid_amount, grand_total
      `;
      if (rows.length === 0) {
        throw new ConflictException(
          `Receipt of ${dto.amount} exceeds the outstanding balance on invoice ${invoice.invoice_number}, or it changed concurrently`,
        );
      }

      const payment_status = resolvePaymentStatus(
        Number(rows[0].paid_amount),
        Number(rows[0].grand_total),
      );
      await tx.spSalesInvoice.update({
        where: { si_id: dto.si_id },
        data: { payment_status },
      });

      return tx.spSalesReceipt.create({
        data: {
          institute_id: instituteId,
          si_id: dto.si_id,
          receipt_date: new Date(dto.receipt_date),
          amount: dto.amount,
          mode: dto.mode,
          reference_no: dto.reference_no,
          created_by: actorId,
        },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_RECEIPT,
      entityId: String(receipt.receipt_id),
      action: 'create',
      metadata: { si_id: dto.si_id, amount: dto.amount },
    });
    return receipt;
  }

  async findAll(instituteId: string, query: QuerySalesReceiptDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = {
      institute_id: instituteId,
      si_id: query.si_id,
      receipt_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spSalesReceipt.findMany({
        where,
        include: {
          invoice: {
            select: { si_id: true, invoice_number: true, customer_id: true },
          },
        },
        orderBy: { receipt_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.spSalesReceipt.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const receipt = await this.prisma.spSalesReceipt.findFirst({
      where: { receipt_id: id, institute_id: instituteId },
      include: { invoice: true },
    });
    if (!receipt) throw new NotFoundException(`Sales receipt #${id} not found`);
    return receipt;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateSalesReceiptDto,
    actorId: string,
  ) {
    await this.findOne(instituteId, id);
    const updated = await this.prisma.spSalesReceipt.update({
      where: { receipt_id: id },
      data: {
        receipt_date: dto.receipt_date ? new Date(dto.receipt_date) : undefined,
        mode: dto.mode,
        reference_no: dto.reference_no,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_RECEIPT,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId: string) {
    const receipt = await this.findOne(instituteId, id);

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ paid_amount: any; grand_total: any }[]>`
        UPDATE sp_sales_invoices
        SET paid_amount = paid_amount - ${receipt.amount}::numeric
        WHERE si_id = ${receipt.si_id} AND paid_amount - ${receipt.amount}::numeric >= 0
        RETURNING paid_amount, grand_total
      `;
      if (rows.length === 0) {
        throw new ConflictException(
          'Unable to reverse this receipt — the invoice balance changed concurrently',
        );
      }
      const payment_status = resolvePaymentStatus(
        Number(rows[0].paid_amount),
        Number(rows[0].grand_total),
      );
      await tx.spSalesInvoice.update({
        where: { si_id: receipt.si_id },
        data: { payment_status },
      });
      await tx.spSalesReceipt.delete({ where: { receipt_id: id } });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.SALES_RECEIPT,
      entityId: String(id),
      action: 'delete',
      metadata: { si_id: receipt.si_id, amount: Number(receipt.amount) },
    });
    return { success: true };
  }
}
