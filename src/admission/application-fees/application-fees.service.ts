import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdmissionApplicationFeePayment,
  AdmissionPaymentMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import {
  PayApplicationFeeDto,
  UpdateApplicationFeePaymentDto,
} from './dto/application-fee.dto';

const CLOSED_STATUSES = ['cancelled', 'rejected', 'admitted'];

/** A cash payment has no reference; every other mode must carry one before it counts as successful. */
function assertReferenceForSuccess(
  mode: AdmissionPaymentMode,
  ref?: string | null,
) {
  if (mode !== 'cash' && !ref?.trim()) {
    throw new BusinessException(
      'TRANSACTION_REF_REQUIRED',
      `A transaction reference is required for a successful ${mode.replace('_', ' ')} payment.`,
    );
  }
}

@Injectable()
export class ApplicationFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly audit: AdmissionAuditService,
  ) {}

  private assertNotFuture(paymentDate: Date) {
    const limit = Date.now() + 24 * 60 * 60 * 1000; // one day of slack for timezone skew
    if (paymentDate.getTime() > limit) {
      throw new BusinessException(
        'INVALID_PAYMENT_DATE',
        'payment_date cannot be in the future.',
      );
    }
  }

  private async assertNoSuccessfulPayment(
    tx: Prisma.TransactionClient,
    applicationId: number,
  ) {
    const paid = await tx.admissionApplicationFeePayment.findFirst({
      where: { application_id: applicationId, status: 'success' },
      select: { payment_id: true },
    });
    if (paid) {
      throw new BusinessException(
        'APPLICATION_FEE_ALREADY_PAID',
        'The application fee has already been paid for this application.',
        { payment_id: paid.payment_id },
        HttpStatus.CONFLICT,
      );
    }
  }

  async record(
    actor: AdmissionPlatformUser,
    applicationId: number,
    dto: PayApplicationFeeDto,
  ) {
    const paymentDate = new Date(dto.payment_date);
    this.assertNotFuture(paymentDate);
    if (dto.status === 'success')
      assertReferenceForSuccess(dto.payment_mode, dto.transaction_ref);

    let payment: AdmissionApplicationFeePayment;
    let replayed = false;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const application = await this.lookup.lockApplication(
          actor.institute_id,
          applicationId,
          tx,
        );
        if (CLOSED_STATUSES.includes(application.status)) {
          throw new BusinessException(
            'APPLICATION_CLOSED',
            `Fees cannot be recorded for an application in status "${application.status}".`,
            { status: application.status },
          );
        }

        // Idempotent replay: same key → the original payment, not a second one.
        if (dto.idempotency_key) {
          const existing = await tx.admissionApplicationFeePayment.findUnique({
            where: {
              application_id_idempotency_key: {
                application_id: applicationId,
                idempotency_key: dto.idempotency_key,
              },
            },
          });
          if (existing) {
            replayed = true;
            return existing;
          }
        }

        if (dto.status === 'success')
          await this.assertNoSuccessfulPayment(tx, applicationId);

        return tx.admissionApplicationFeePayment.create({
          data: {
            application_id: applicationId,
            amount: new Prisma.Decimal(dto.amount),
            payment_date: paymentDate,
            payment_mode: dto.payment_mode,
            transaction_ref: dto.transaction_ref?.trim() || null,
            status: dto.status,
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

    // A replayed idempotency key is a no-op: no second audit entry.
    if (replayed) return payment;

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION_FEE,
      entityId: String(payment.payment_id),
      action: 'record',
      newStatus: payment.status,
      metadata: {
        application_id: applicationId,
        amount: payment.amount.toString(),
        payment_mode: payment.payment_mode,
        transaction_ref: payment.transaction_ref,
      },
    });
    return payment;
  }

  async list(instituteId: string, applicationId: number) {
    await this.lookup.application(instituteId, applicationId);
    const payments = await this.prisma.admissionApplicationFeePayment.findMany({
      where: { application_id: applicationId },
      orderBy: { created_at: 'desc' },
    });
    const paid = payments
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
    return {
      payments,
      is_paid: payments.some((p) => p.status === 'success'),
      paid_total: paid,
    };
  }

  /** Settle a pending payment to success/failed — pending is the only state that can still change. */
  async settle(
    actor: AdmissionPlatformUser,
    applicationId: number,
    paymentId: number,
    dto: UpdateApplicationFeePaymentDto,
  ) {
    if (dto.status === 'pending') {
      throw new BusinessException(
        'INVALID_STATUS',
        'A payment can only be settled to success or failed.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lockApplication(actor.institute_id, applicationId, tx);
      const payment = await tx.admissionApplicationFeePayment.findFirst({
        where: { payment_id: paymentId, application_id: applicationId },
      });
      if (!payment)
        throw new NotFoundException(`Payment #${paymentId} not found`);

      if (payment.status !== 'pending') {
        throw new BusinessException(
          'PAYMENT_ALREADY_SETTLED',
          `This payment is already ${payment.status}.`,
          { status: payment.status },
          HttpStatus.CONFLICT,
        );
      }
      const ref = dto.transaction_ref?.trim() || payment.transaction_ref;
      if (dto.status === 'success') {
        assertReferenceForSuccess(payment.payment_mode, ref);
        await this.assertNoSuccessfulPayment(tx, applicationId);
      }

      const result = await tx.admissionApplicationFeePayment.updateMany({
        where: { payment_id: paymentId, status: 'pending' },
        data: { status: dto.status, transaction_ref: ref },
      });
      if (result.count === 0) {
        throw new BusinessException(
          'PAYMENT_ALREADY_SETTLED',
          'Another user has already settled this payment.',
          undefined,
          HttpStatus.CONFLICT,
        );
      }
      return tx.admissionApplicationFeePayment.findUniqueOrThrow({
        where: { payment_id: paymentId },
      });
    });

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION_FEE,
      entityId: String(paymentId),
      action: 'settle',
      oldStatus: 'pending',
      newStatus: updated.status,
      metadata: {
        application_id: applicationId,
        transaction_ref: updated.transaction_ref,
      },
    });
    return updated;
  }
}
