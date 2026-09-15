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
import { CreatePurchasePaymentDto } from './dto/create-purchase-payment.dto';
import { UpdatePurchasePaymentDto } from './dto/update-purchase-payment.dto';
import { QueryPurchasePaymentDto } from './dto/query-purchase-payment.dto';

@Injectable()
export class PurchasePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  /**
   * Applying/reversing a payment against the invoice's paid_amount uses the
   * same atomic conditional-UPDATE guard as GRN receiving and invoice
   * posting: the WHERE clause re-checks "does not exceed outstanding" (or,
   * for a reversal, "stays >= 0") against the row's current value under its
   * own lock, so two concurrent payments can never both push paid_amount
   * past grand_total (module spec §28/§39/§69).
   */
  async create(
    instituteId: string,
    dto: CreatePurchasePaymentDto,
    actorId: string,
  ) {
    const invoice = await this.prisma.spPurchaseInvoice.findFirst({
      where: { pi_id: dto.pi_id, institute_id: instituteId },
    });
    if (!invoice)
      throw new NotFoundException(`Purchase invoice #${dto.pi_id} not found`);
    if (invoice.status !== SpInvoiceStatus.POSTED) {
      throw new BadRequestException(
        `Purchase invoice ${invoice.invoice_number} is ${invoice.status}; payments can only be recorded against a POSTED invoice`,
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ paid_amount: any; grand_total: any }[]>`
        UPDATE sp_purchase_invoices
        SET paid_amount = paid_amount + ${dto.amount}::numeric
        WHERE pi_id = ${dto.pi_id} AND status = 'POSTED' AND paid_amount + ${dto.amount}::numeric <= grand_total
        RETURNING paid_amount, grand_total
      `;
      if (rows.length === 0) {
        throw new ConflictException(
          `Payment of ${dto.amount} exceeds the outstanding balance on invoice ${invoice.invoice_number}, or it changed concurrently`,
        );
      }

      const payment_status = resolvePaymentStatus(
        Number(rows[0].paid_amount),
        Number(rows[0].grand_total),
      );
      await tx.spPurchaseInvoice.update({
        where: { pi_id: dto.pi_id },
        data: { payment_status },
      });

      return tx.spPurchasePayment.create({
        data: {
          institute_id: instituteId,
          pi_id: dto.pi_id,
          payment_date: new Date(dto.payment_date),
          amount: dto.amount,
          mode: dto.mode,
          reference_no: dto.reference_no,
          created_by: actorId,
        },
      });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_PAYMENT,
      entityId: String(payment.payment_id),
      action: 'create',
      metadata: { pi_id: dto.pi_id, amount: dto.amount },
    });
    return payment;
  }

  async findAll(instituteId: string, query: QueryPurchasePaymentDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = {
      institute_id: instituteId,
      pi_id: query.pi_id,
      payment_date:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spPurchasePayment.findMany({
        where,
        include: {
          invoice: {
            select: { pi_id: true, invoice_number: true, vendor_id: true },
          },
        },
        orderBy: { payment_date: 'desc' },
        skip,
        take,
      }),
      this.prisma.spPurchasePayment.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const payment = await this.prisma.spPurchasePayment.findFirst({
      where: { payment_id: id, institute_id: instituteId },
      include: { invoice: true },
    });
    if (!payment)
      throw new NotFoundException(`Purchase payment #${id} not found`);
    return payment;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdatePurchasePaymentDto,
    actorId: string,
  ) {
    await this.findOne(instituteId, id);
    const updated = await this.prisma.spPurchasePayment.update({
      where: { payment_id: id },
      data: {
        payment_date: dto.payment_date ? new Date(dto.payment_date) : undefined,
        mode: dto.mode,
        reference_no: dto.reference_no,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_PAYMENT,
      entityId: String(id),
      action: 'update',
    });
    return updated;
  }

  async remove(instituteId: string, id: number, actorId: string) {
    const payment = await this.findOne(instituteId, id);

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ paid_amount: any; grand_total: any }[]>`
        UPDATE sp_purchase_invoices
        SET paid_amount = paid_amount - ${payment.amount}::numeric
        WHERE pi_id = ${payment.pi_id} AND paid_amount - ${payment.amount}::numeric >= 0
        RETURNING paid_amount, grand_total
      `;
      if (rows.length === 0) {
        throw new ConflictException(
          'Unable to reverse this payment — the invoice balance changed concurrently',
        );
      }
      const payment_status = resolvePaymentStatus(
        Number(rows[0].paid_amount),
        Number(rows[0].grand_total),
      );
      await tx.spPurchaseInvoice.update({
        where: { pi_id: payment.pi_id },
        data: { payment_status },
      });
      await tx.spPurchasePayment.delete({ where: { payment_id: id } });
    });

    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.PURCHASE_PAYMENT,
      entityId: String(id),
      action: 'delete',
      metadata: { pi_id: payment.pi_id, amount: Number(payment.amount) },
    });
    return { success: true };
  }
}
