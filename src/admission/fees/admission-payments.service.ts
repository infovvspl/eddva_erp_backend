import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionPayment, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionNumberingService } from '../common/admission-numbering.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { computeFeeSummary } from '../common/admission-fee.util';
import { BusinessException } from '../common/business-exception';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { AdmissionNotificationService } from '../notifications/admission-notification.service';
import { PayAdmissionFeeDto, QueryAdmissionPaymentDto } from './dto/fee.dto';

const PAYMENT_INCLUDE = {
  application: {
    select: {
      application_id: true,
      application_number: true,
      status: true,
      applicant: {
        select: { applicant_id: true, name: true, email: true, phone: true },
      },
      program: { select: { program_id: true, name: true } },
      session: { select: { session_id: true, name: true } },
    },
  },
} satisfies Prisma.AdmissionPaymentInclude;

@Injectable()
export class AdmissionPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly numbering: AdmissionNumberingService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  /**
   * Records an admission-fee payment and issues its receipt number.
   *
   * There is no payment gateway: this is a staff-recorded payment of money
   * actually received, so a row's existence means "received" — nothing here
   * assumes or fabricates a gateway success. Payments are only accepted for an
   * application whose offer has been accepted, and never beyond the configured
   * fee (partial payments are allowed). The application row lock serialises
   * concurrent payments so the balance check cannot be raced into an overpayment.
   */
  async record(
    actor: AdmissionPlatformUser,
    applicationId: number,
    dto: PayAdmissionFeeDto,
  ) {
    const paymentDate = new Date(dto.payment_date);
    if (paymentDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BusinessException(
        'INVALID_PAYMENT_DATE',
        'payment_date cannot be in the future.',
      );
    }
    if (dto.payment_mode !== 'cash' && !dto.transaction_ref?.trim()) {
      throw new BusinessException(
        'TRANSACTION_REF_REQUIRED',
        `A transaction reference is required for a ${dto.payment_mode.replace('_', ' ')} payment.`,
      );
    }
    const amount = new Prisma.Decimal(dto.amount_paid);

    let payment: AdmissionPayment;
    let replayed = false;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const application = await this.lookup.lockApplication(
          actor.institute_id,
          applicationId,
          tx,
        );

        if (dto.idempotency_key) {
          const replay = await tx.admissionPayment.findUnique({
            where: {
              application_id_idempotency_key: {
                application_id: applicationId,
                idempotency_key: dto.idempotency_key,
              },
            },
          });
          if (replay) {
            replayed = true;
            return replay;
          }
        }

        const [offer, confirmation] = await Promise.all([
          tx.admissionOffer.findUnique({
            where: { application_id: applicationId },
          }),
          tx.admissionConfirmation.findUnique({
            where: { application_id: applicationId },
          }),
        ]);
        if (confirmation || application.status === 'admitted') {
          throw new BusinessException(
            'ADMISSION_ALREADY_CONFIRMED',
            'This application has already been confirmed.',
            undefined,
            HttpStatus.CONFLICT,
          );
        }
        if (application.status !== 'offered' || offer?.status !== 'accepted') {
          throw new BusinessException(
            'OFFER_NOT_ACCEPTED',
            'The admission fee can only be paid after the offer has been accepted.',
            {
              application_status: application.status,
              offer_status: offer?.status ?? null,
            },
          );
        }

        const summary = await computeFeeSummary(tx, application);
        if (!summary.fee_structure_configured) {
          throw new BusinessException(
            'ADMISSION_FEE_NOT_CONFIGURED',
            'No admission fee is configured for this program and session.',
          );
        }
        if (summary.is_paid) {
          throw new BusinessException(
            'ADMISSION_FEE_ALREADY_PAID',
            'The admission fee has already been paid in full.',
            undefined,
            HttpStatus.CONFLICT,
          );
        }
        if (amount.gt(summary.balance!)) {
          throw new BusinessException(
            'PAYMENT_EXCEEDS_BALANCE',
            `The payment exceeds the outstanding balance of ${summary.balance!.toString()}.`,
            {
              balance: summary.balance!.toString(),
              attempted: amount.toString(),
            },
          );
        }

        return tx.admissionPayment.create({
          data: {
            application_id: applicationId,
            amount_paid: amount,
            payment_date: paymentDate,
            payment_mode: dto.payment_mode,
            transaction_ref: dto.transaction_ref?.trim() || null,
            receipt_number: await this.numbering.next('RECEIPT', tx),
            idempotency_key: dto.idempotency_key,
            recorded_by: actor.eddva_user_id,
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BusinessException(
          'DUPLICATE_PAYMENT',
          'This payment has already been recorded.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    const application =
      await this.prisma.admissionApplication.findUniqueOrThrow({
        where: { application_id: applicationId },
        include: { applicant: { select: { email: true, phone: true } } },
      });

    // A replayed idempotency key is a no-op: no second audit entry and no second receipt notification.
    if (replayed) {
      return {
        payment,
        fee_summary: await computeFeeSummary(this.prisma, application),
      };
    }

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.PAYMENT,
      entityId: String(payment.payment_id),
      action: 'record',
      metadata: {
        application_id: applicationId,
        amount_paid: payment.amount_paid.toString(),
        payment_mode: payment.payment_mode,
        receipt_number: payment.receipt_number,
        transaction_ref: payment.transaction_ref,
      },
    });

    await this.notifications.queue({
      instituteId: actor.institute_id,
      entityType: ADM_ENTITY.PAYMENT,
      entityId: payment.payment_id,
      eventType: 'payment_receipt',
      recipient: application.applicant.email ?? application.applicant.phone,
      channel: application.applicant.email ? 'email' : 'sms',
      message: `Receipt ${payment.receipt_number}: ${payment.amount_paid.toString()} received for ${application.application_number}.`,
    });

    return {
      payment,
      fee_summary: await computeFeeSummary(this.prisma, application),
    };
  }

  async listForApplication(instituteId: string, applicationId: number) {
    const application = await this.lookup.application(
      instituteId,
      applicationId,
    );
    const [payments, fee_summary] = await Promise.all([
      this.prisma.admissionPayment.findMany({
        where: { application_id: applicationId },
        orderBy: { created_at: 'desc' },
      }),
      computeFeeSummary(this.prisma, application),
    ]);
    return { payments, fee_summary };
  }

  async findAll(instituteId: string, query: QueryAdmissionPaymentDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AdmissionPaymentWhereInput = {
      application_id: query.application_id,
      payment_mode: query.payment_mode,
      payment_date: buildDateRange(query.from, query.to),
      application: {
        institute_id: instituteId,
        deleted_at: null,
        program_id: query.program_id,
        session_id: query.session_id,
      },
      ...(query.search
        ? {
            OR: [
              {
                receipt_number: { contains: query.search, mode: 'insensitive' },
              },
              {
                transaction_ref: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                application: {
                  application_number: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                application: {
                  applicant: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionPayment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.admissionPayment.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  /** Receipt view: the payment with the application/applicant it belongs to. */
  async findOne(instituteId: string, id: number) {
    const payment = await this.prisma.admissionPayment.findFirst({
      where: {
        payment_id: id,
        application: { institute_id: instituteId, deleted_at: null },
      },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) throw new NotFoundException(`Payment #${id} not found`);
    return payment;
  }
}
