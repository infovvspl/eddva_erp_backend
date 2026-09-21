import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { BusinessException } from '../common/business-exception';
import { isUniqueViolation } from '../common/unique-violation.util';
import { parseDateTime } from '../common/time.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { RecordEventPaymentDto } from './dto/event.dto';

const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Ticket payments for paid events.
 *
 * There is no payment gateway in this backend, so a payment is never something
 * the client can "report as successful": only alumni-office staff (permission
 * `event_payments:create`, staff-only route) record a payment after the money
 * has actually been received, with the bank / gateway reference. The amount
 * must equal the ticket price captured at registration, and one registration
 * has at most one payment (unique index), so a registration can never be
 * marked paid twice or for the wrong amount.
 */
@Injectable()
export class EventPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  async record(
    actor: AlumniPlatformUser,
    registrationId: number,
    dto: RecordEventPaymentDto,
  ) {
    const preview = await this.lookup.registration(
      actor.institute_id,
      registrationId,
    );
    const paidAt = dto.paid_at
      ? parseDateTime(dto.paid_at, 'paid_at')
      : new Date();
    if (paidAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw new BusinessException(
        'INVALID_PAYMENT_DATE',
        'paid_at cannot be in the future',
      );
    }

    const payment = await this.prisma
      .$transaction(async (tx) => {
        await this.lookup.lock(
          tx,
          'registration',
          actor.institute_id,
          registrationId,
        );
        const reg = await this.lookup.registration(
          actor.institute_id,
          registrationId,
          tx,
        );
        if (reg.event.status === 'cancelled') {
          throw new BusinessException(
            'EVENT_CANCELLED',
            'This event has been cancelled',
          );
        }
        if (reg.attendance_status === 'cancelled') {
          throw new BusinessException(
            'REGISTRATION_CANCELLED',
            'This registration is cancelled',
          );
        }
        if (!reg.event.is_paid || reg.amount_due == null) {
          throw new BusinessException(
            'EVENT_NOT_PAID',
            'This event does not need a payment',
          );
        }
        if (reg.payment_status === 'paid') {
          throw new BusinessException(
            'ALREADY_PAID',
            'This registration is already paid',
            undefined,
            409,
          );
        }
        const amount = new Prisma.Decimal(dto.amount);
        if (!amount.equals(reg.amount_due)) {
          throw new BusinessException(
            'AMOUNT_MISMATCH',
            'The amount must equal the ticket price captured at registration',
            {
              expected: reg.amount_due.toFixed(2),
              received: amount.toFixed(2),
            },
          );
        }
        const created = await tx.alumniEventPayment.create({
          data: {
            institute_id: actor.institute_id,
            registration_id: registrationId,
            amount,
            payment_mode: dto.payment_mode,
            transaction_ref: dto.transaction_ref,
            paid_at: paidAt,
            recorded_by: actor.eddva_user_id,
          },
        });
        const { count } = await tx.alumniEventRegistration.updateMany({
          where: { registration_id: registrationId, payment_status: 'pending' },
          data: { payment_status: 'paid' },
        });
        if (count === 0) {
          throw new BusinessException(
            'ALREADY_PAID',
            'This registration is no longer awaiting payment',
            undefined,
            409,
          );
        }
        return created;
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err)) {
          throw new BusinessException(
            'PAYMENT_ALREADY_RECORDED',
            'This transaction reference (or this registration) already has a recorded payment',
            undefined,
            409,
          );
        }
        throw err;
      });

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT_PAYMENT,
      entityId: String(payment.payment_id),
      action: 'record',
      oldStatus: 'pending',
      newStatus: 'paid',
      metadata: {
        registration_id: registrationId,
        amount: payment.amount.toFixed(2),
        payment_mode: payment.payment_mode,
        transaction_ref: payment.transaction_ref,
      },
    });
    const alumni = await this.prisma.alumniProfile.findUnique({
      where: { alumni_id: preview.alumni_id },
      select: { email: true },
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.REGISTRATION,
        entityId: registrationId,
        eventType: 'event_payment_confirmed',
        message: `Payment of ${payment.amount.toFixed(2)} for "${preview.event.title}" was received.`,
      },
      { alumni_id: preview.alumni_id, email: alumni?.email },
    );
    return payment;
  }

  /** Own payment for an alumnus; any payment for staff. */
  async find(actor: AlumniPlatformUser, registrationId: number) {
    const reg = await this.lookup.registration(
      actor.institute_id,
      registrationId,
    );
    if (isAlumniPrincipal(actor) && reg.alumni_id !== actor.alumni_id) {
      throw new NotFoundException(
        `Event registration #${registrationId} not found`,
      );
    }
    const payment = await this.prisma.alumniEventPayment.findUnique({
      where: { registration_id: registrationId },
    });
    if (!payment) {
      throw new NotFoundException(
        'No payment has been recorded for this registration',
      );
    }
    return payment;
  }
}
