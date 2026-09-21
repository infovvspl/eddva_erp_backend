import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNumberingService } from '../common/hostel-numbering.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { dateOnlyString, localToday, parseDateOnly } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { QueryHostelPaymentDto, RecordHostelPaymentDto } from './dto/fee.dto';

const PAYMENT_INCLUDE = {
  invoice: {
    select: {
      invoice_id: true,
      invoice_no: true,
      billing_period: true,
      amount_due: true,
      amount_paid: true,
      payment_status: true,
    },
  },
  resident: {
    select: { resident_id: true, student_name: true, admission_no: true },
  },
} satisfies Prisma.HostelFeePaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly numbering: HostelNumberingService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  /**
   * Records a payment and re-derives the invoice status in ONE transaction.
   * The invoice row is locked first, so two cashiers paying the same invoice
   * at once queue up and the second one is validated against the first one's
   * result — the balance can never go negative. The database also carries a
   * CHECK (amount_paid <= amount_due) as a backstop.
   */
  async record(
    actor: HostelPlatformUser,
    invoiceId: number,
    dto: RecordHostelPaymentDto,
  ) {
    const paymentDate = dto.payment_date
      ? parseDateOnly(dto.payment_date, 'payment_date')
      : localToday();
    if (paymentDate.getTime() > localToday().getTime()) {
      throw new BusinessException(
        'INVALID_PAYMENT_DATE',
        'payment_date cannot be in the future',
      );
    }
    if (dto.payment_mode !== 'cash' && !dto.transaction_ref) {
      throw new BusinessException(
        'TRANSACTION_REF_REQUIRED',
        `A transaction reference is required for ${dto.payment_mode} payments`,
      );
    }
    const amount = new Prisma.Decimal(dto.amount_paid);
    await this.lookup.invoice(actor.institute_id, invoiceId);

    const { payment, invoice, previousStatus } = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.lookup.lockInvoice(
          actor.institute_id,
          invoiceId,
          tx,
        );
        if (locked.cancelled_at) {
          throw new BusinessException(
            'INVOICE_CANCELLED',
            'This invoice was cancelled and cannot take payments',
            undefined,
            HttpStatus.CONFLICT,
          );
        }
        const balance = locked.amount_due.minus(locked.amount_paid);
        if (balance.lte(0)) {
          throw new BusinessException(
            'INVOICE_ALREADY_PAID',
            'This invoice is already fully paid',
            undefined,
            HttpStatus.CONFLICT,
          );
        }
        if (amount.gt(balance)) {
          throw new BusinessException(
            'PAYMENT_EXCEEDS_BALANCE',
            `Payment of ${amount.toFixed(2)} exceeds the outstanding balance of ${balance.toFixed(2)}`,
            {
              outstanding_balance: balance.toFixed(2),
              attempted: amount.toFixed(2),
            },
          );
        }
        const receipt_no = await this.numbering.next('RECEIPT', tx);
        const payment = await tx.hostelFeePayment.create({
          data: {
            institute_id: actor.institute_id,
            receipt_no,
            invoice_id: invoiceId,
            resident_id: locked.resident_id,
            amount_paid: amount,
            payment_date: paymentDate,
            payment_mode: dto.payment_mode,
            transaction_ref: dto.transaction_ref,
            received_by: actor.eddva_user_id,
            remarks: dto.remarks,
          },
          include: PAYMENT_INCLUDE,
        });
        const newPaid = locked.amount_paid.plus(amount);
        const invoice = await tx.hostelFeeInvoice.update({
          where: { invoice_id: invoiceId },
          data: {
            amount_paid: newPaid,
            payment_status: newPaid.gte(locked.amount_due)
              ? 'paid'
              : 'partially_paid',
          },
        });
        return { payment, invoice, previousStatus: locked.payment_status };
      },
    );

    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.PAYMENT,
      entityId: String(payment.payment_id),
      action: 'record',
      metadata: {
        receipt_no: payment.receipt_no,
        invoice_id: invoiceId,
        amount: amount.toFixed(2),
        mode: payment.payment_mode,
      },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.INVOICE,
      entityId: String(invoiceId),
      action: 'payment_applied',
      oldStatus: previousStatus,
      newStatus: invoice.payment_status,
      metadata: {
        receipt_no: payment.receipt_no,
        amount_paid_total: invoice.amount_paid.toFixed(2),
      },
    });
    const resident = await this.lookup.resident(
      actor.institute_id,
      invoice.resident_id,
    );
    await this.notifications.notifyGuardian(
      {
        instituteId: actor.institute_id,
        entityType: HOSTEL_ENTITY.PAYMENT,
        entityId: payment.payment_id,
        eventType: 'fee_payment_received',
        message: `Received ${amount.toFixed(2)} for hostel invoice ${invoice.invoice_no} (receipt ${payment.receipt_no}). Balance: ${invoice.amount_due.minus(invoice.amount_paid).toFixed(2)}.`,
      },
      resident,
    );
    return {
      payment,
      invoice: {
        invoice_id: invoice.invoice_id,
        invoice_no: invoice.invoice_no,
        amount_due: invoice.amount_due.toFixed(2),
        amount_paid: invoice.amount_paid.toFixed(2),
        balance: invoice.amount_due.minus(invoice.amount_paid).toFixed(2),
        payment_status: invoice.payment_status,
      },
    };
  }

  private async page(
    query: QueryHostelPaymentDto,
    where: Prisma.HostelFeePaymentWhereInput,
  ) {
    const { skip, take, page, limit } = parsePagination(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelFeePayment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: [{ payment_date: 'desc' }, { payment_id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.hostelFeePayment.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  findAll(instituteId: string, query: QueryHostelPaymentDto) {
    const range = buildDateRange(query.from, query.to);
    return this.page(query, {
      institute_id: instituteId,
      invoice_id: query.invoice_id,
      resident_id: query.resident_id,
      payment_mode: query.payment_mode,
      ...(range ? { payment_date: range } : {}),
      ...(query.search
        ? {
            OR: [
              { receipt_no: { contains: query.search, mode: 'insensitive' } },
              {
                transaction_ref: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                resident: {
                  student_name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    });
  }

  async forInvoice(
    instituteId: string,
    invoiceId: number,
    query: QueryHostelPaymentDto,
  ) {
    await this.lookup.invoice(instituteId, invoiceId);
    return this.findAll(instituteId, { ...query, invoice_id: invoiceId });
  }

  async forResident(
    instituteId: string,
    residentId: number,
    query: QueryHostelPaymentDto,
  ) {
    await this.lookup.resident(instituteId, residentId);
    return this.findAll(instituteId, { ...query, resident_id: residentId });
  }

  async findOne(instituteId: string, id: number) {
    const payment = await this.prisma.hostelFeePayment.findFirst({
      where: { payment_id: id, institute_id: instituteId },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) throw new NotFoundException(`Payment #${id} not found`);
    return payment;
  }

  /** Receipt for one payment, including the balance left on the invoice right after it. */
  async receipt(instituteId: string, id: number) {
    const payment = await this.findOne(instituteId, id);
    const upToHere = await this.prisma.hostelFeePayment.aggregate({
      where: { invoice_id: payment.invoice_id, payment_id: { lte: id } },
      _sum: { amount_paid: true },
    });
    const paidSoFar = new Prisma.Decimal(upToHere._sum.amount_paid ?? 0);
    return {
      receipt_no: payment.receipt_no,
      payment_date: dateOnlyString(payment.payment_date),
      resident: payment.resident,
      invoice_no: payment.invoice.invoice_no,
      billing_period: payment.invoice.billing_period,
      amount_paid: payment.amount_paid.toFixed(2),
      payment_mode: payment.payment_mode,
      transaction_ref: payment.transaction_ref,
      invoice_amount: payment.invoice.amount_due.toFixed(2),
      total_paid_after_this_payment: paidSoFar.toFixed(2),
      balance_after_this_payment: payment.invoice.amount_due
        .minus(paidSoFar)
        .toFixed(2),
      received_by: payment.received_by,
    };
  }
}
