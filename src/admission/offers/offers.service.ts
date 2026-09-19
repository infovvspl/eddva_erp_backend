import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionOffer, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionSeatsService } from '../common/admission-seats.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import {
  OFFERABLE_STATUSES,
  moveApplicationStatus,
  moveApplicationStatusOrConflict,
} from '../common/application-state';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { AdmissionNotificationService } from '../notifications/admission-notification.service';
import { DeclineOfferDto, IssueOfferDto, QueryOfferDto } from './dto/offer.dto';

const SORT_FIELDS = ['offer_date', 'offer_expiry_date', 'created_at'] as const;
const REMINDER_WINDOW_DAYS = 3;
const SWEEP_BATCH = 500;

const OFFER_INCLUDE = {
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
} satisfies Prisma.AdmissionOfferInclude;

/** Backend-computed countdown — clients display this rather than inventing their own expiry logic. */
function withCountdown<T extends AdmissionOffer>(offer: T, now = new Date()) {
  const outstanding = offer.status === 'offered';
  const msLeft = offer.offer_expiry_date.getTime() - now.getTime();
  return {
    ...offer,
    seconds_until_expiry: outstanding
      ? Math.max(0, Math.floor(msLeft / 1000))
      : null,
    /** true when the expiry has passed but the sweep has not yet flipped the status; it can no longer be accepted */
    expiry_pending_sweep: outstanding && msLeft <= 0,
  };
}

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly seats: AdmissionSeatsService,
    private readonly audit: AdmissionAuditService,
    private readonly notifications: AdmissionNotificationService,
  ) {}

  // ─── Issue ────────────────────────────────────────────────────────────────

  /**
   * Issues an offer and moves the application to `offered`, atomically.
   *
   * Seat safety: inside the transaction the application row and then the
   * program row are locked (`FOR UPDATE`) before capacity is checked, so two
   * concurrent offers for the last seat serialise — the loser sees the seat
   * already held and gets a 409, instead of both passing a stale
   * `available > 0` check.
   */
  async issue(
    actor: AdmissionPlatformUser,
    applicationId: number,
    dto: IssueOfferDto,
  ) {
    const now = new Date();
    const offerDate = dto.offer_date ? new Date(dto.offer_date) : now;
    const expiry = new Date(dto.offer_expiry_date);
    if (expiry <= offerDate) {
      throw new BusinessException(
        'INVALID_EXPIRY',
        'offer_expiry_date must be after the offer date.',
      );
    }
    if (expiry <= now) {
      throw new BusinessException(
        'OFFER_EXPIRY_IN_PAST',
        'offer_expiry_date must be in the future.',
      );
    }

    const { offer, application, seat } = await this.prisma.$transaction(
      async (tx) => {
        const app = await this.lookup.lockApplication(
          actor.institute_id,
          applicationId,
          tx,
        );
        if (!OFFERABLE_STATUSES.includes(app.status)) {
          throw new BusinessException(
            'APPLICATION_NOT_OFFERABLE',
            `An offer can only be issued to a shortlisted or waitlisted application (currently "${app.status}").`,
            { status: app.status },
          );
        }

        const existing = await tx.admissionOffer.findUnique({
          where: { application_id: applicationId },
        });
        if (
          existing &&
          (existing.status === 'offered' || existing.status === 'accepted')
        ) {
          throw new BusinessException(
            'OFFER_ALREADY_EXISTS',
            `This application already has an offer that is ${existing.status}.`,
            { offer_id: existing.offer_id, status: existing.status },
            HttpStatus.CONFLICT,
          );
        }

        const seatState = await this.seats.lockAndAssertSeatAvailable(
          tx,
          app.program_id,
          app.session_id,
        );

        const data = {
          offer_date: offerDate,
          offer_expiry_date: expiry,
          seat_category: dto.seat_category,
          status: 'offered' as const,
          issued_by: actor.eddva_user_id,
          responded_by: null,
          responded_at: null,
          response_note: null,
        };
        // An expired/declined offer row is re-used (one offer row per application).
        const saved = existing
          ? await tx.admissionOffer.update({
              where: { offer_id: existing.offer_id },
              data,
            })
          : await tx.admissionOffer.create({
              data: { ...data, application_id: applicationId },
            });

        await moveApplicationStatusOrConflict(
          tx,
          applicationId,
          OFFERABLE_STATUSES,
          'offered',
        );
        return { offer: saved, application: app, seat: seatState };
      },
    );

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.OFFER,
      entityId: String(offer.offer_id),
      action: 'issue',
      newStatus: 'offered',
      metadata: {
        application_id: applicationId,
        offer_expiry_date: expiry,
        seat_category: dto.seat_category,
        seats: { total: seat.total_seats, held_before: seat.held },
      },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(applicationId),
      action: 'status_change',
      oldStatus: application.status,
      newStatus: 'offered',
      reason: 'Offer issued',
      metadata: { application_id: applicationId, offer_id: offer.offer_id },
    });

    const full = await this.getForApplication(
      actor.institute_id,
      applicationId,
    );
    const applicant = full.application.applicant;
    await this.notifications.queue({
      instituteId: actor.institute_id,
      entityType: ADM_ENTITY.OFFER,
      entityId: offer.offer_id,
      eventType: 'offer_issued',
      recipient: applicant.email ?? applicant.phone,
      channel: applicant.email ? 'email' : 'sms',
      message: `Admission offer for ${full.application.application_number}, valid until ${expiry.toISOString()}.`,
    });
    return full;
  }

  // ─── Expiry ───────────────────────────────────────────────────────────────

  /**
   * Flips one overdue offer to `expired` and returns its application to
   * `shortlisted` (the seat is released). Guarded by status + expiry so it is
   * idempotent and safe to run concurrently from the sweep and from a lazy
   * check. Returns false if the offer was not (or no longer) overdue.
   */
  private async expireOne(
    tx: Prisma.TransactionClient,
    offerId: number,
    applicationId: number,
    now: Date,
  ) {
    const flipped = await tx.admissionOffer.updateMany({
      where: {
        offer_id: offerId,
        status: 'offered',
        offer_expiry_date: { lte: now },
      },
      data: { status: 'expired' },
    });
    if (flipped.count === 0) return false;
    await moveApplicationStatus(tx, applicationId, ['offered'], 'shortlisted');
    return true;
  }

  private async recordExpiry(
    instituteId: string,
    offerId: number,
    applicationId: number,
    actor?: AdmissionPlatformUser,
  ) {
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.OFFER,
      entityId: String(offerId),
      action: 'expire',
      oldStatus: 'offered',
      newStatus: 'expired',
      metadata: { application_id: applicationId },
    });
    await this.audit.log(actor, {
      entityType: ADM_ENTITY.APPLICATION,
      entityId: String(applicationId),
      action: 'status_change',
      oldStatus: 'offered',
      newStatus: 'shortlisted',
      reason: 'Offer expired',
      metadata: { application_id: applicationId, offer_id: offerId },
    });
    await this.notifications.queue({
      instituteId,
      entityType: ADM_ENTITY.OFFER,
      entityId: offerId,
      eventType: 'offer_expired',
      message: 'The admission offer has expired.',
    });
  }

  /** Scheduler entry point: expires every outstanding offer whose expiry has passed. */
  async expireOverdueOffers(now = new Date()): Promise<number> {
    const overdue = await this.prisma.admissionOffer.findMany({
      where: { status: 'offered', offer_expiry_date: { lte: now } },
      select: {
        offer_id: true,
        application_id: true,
        application: { select: { institute_id: true } },
      },
      take: SWEEP_BATCH,
    });
    let expired = 0;
    for (const o of overdue) {
      const flipped = await this.prisma.$transaction((tx) =>
        this.expireOne(tx, o.offer_id, o.application_id, now),
      );
      if (flipped) {
        expired += 1;
        await this.recordExpiry(
          o.application.institute_id,
          o.offer_id,
          o.application_id,
        );
      }
    }
    return expired;
  }

  /** Scheduler entry point: one reminder per outstanding offer that is close to expiring. */
  async queueExpiryReminders(now = new Date()): Promise<number> {
    const horizon = new Date(
      now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const closing = await this.prisma.admissionOffer.findMany({
      where: {
        status: 'offered',
        offer_expiry_date: { gt: now, lte: horizon },
      },
      include: {
        application: {
          select: {
            institute_id: true,
            application_number: true,
            applicant: { select: { email: true, phone: true } },
          },
        },
      },
      take: SWEEP_BATCH,
    });
    if (closing.length === 0) return 0;

    const already = await this.prisma.admissionNotification.findMany({
      where: {
        entity_type: ADM_ENTITY.OFFER,
        event_type: 'offer_expiry_reminder',
        entity_id: { in: closing.map((o) => o.offer_id) },
      },
      select: { entity_id: true },
    });
    const reminded = new Set(already.map((n) => n.entity_id));
    const pending = closing.filter((o) => !reminded.has(o.offer_id));

    await this.notifications.queueMany(
      pending.map((o) => ({
        instituteId: o.application.institute_id,
        entityType: ADM_ENTITY.OFFER,
        entityId: o.offer_id,
        eventType: 'offer_expiry_reminder',
        recipient:
          o.application.applicant.email ?? o.application.applicant.phone,
        channel: o.application.applicant.email
          ? ('email' as const)
          : ('sms' as const),
        message: `Your admission offer for ${o.application.application_number} expires on ${o.offer_expiry_date.toISOString()}.`,
      })),
    );
    return pending.length;
  }

  // ─── Accept / decline ─────────────────────────────────────────────────────

  /**
   * Accepting is refused once the expiry instant has passed — enforced here in
   * the database update itself (`offer_expiry_date > now`), independent of
   * whether the hourly sweep has run yet. An overdue offer met here is expired
   * on the spot (lazy expiry) so the response and stored state agree.
   */
  async accept(actor: AdmissionPlatformUser, applicationId: number) {
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lockApplication(actor.institute_id, applicationId, tx);
      const offer = await this.requireOffer(tx, applicationId);

      if (offer.status === 'accepted')
        return { kind: 'already_accepted' as const, offer };
      if (offer.status === 'declined')
        return { kind: 'declined' as const, offer };
      if (offer.status === 'expired')
        return { kind: 'expired' as const, offer };

      if (offer.offer_expiry_date <= now) {
        const flipped = await this.expireOne(
          tx,
          offer.offer_id,
          applicationId,
          now,
        );
        return { kind: 'expired_now' as const, offer, flipped };
      }
      const accepted = await tx.admissionOffer.updateMany({
        where: {
          offer_id: offer.offer_id,
          status: 'offered',
          offer_expiry_date: { gt: now },
        },
        data: {
          status: 'accepted',
          responded_by: actor.eddva_user_id,
          responded_at: now,
        },
      });
      if (accepted.count === 0) return { kind: 'conflict' as const, offer };
      return { kind: 'accepted' as const, offer };
    });

    switch (outcome.kind) {
      case 'accepted':
        await this.audit.log(actor, {
          entityType: ADM_ENTITY.OFFER,
          entityId: String(outcome.offer.offer_id),
          action: 'accept',
          oldStatus: 'offered',
          newStatus: 'accepted',
          metadata: { application_id: applicationId },
        });
        return this.getForApplication(actor.institute_id, applicationId);
      case 'expired_now':
        if (outcome.flipped)
          await this.recordExpiry(
            actor.institute_id,
            outcome.offer.offer_id,
            applicationId,
          );
        throw this.expiredError(outcome.offer);
      case 'expired':
        throw this.expiredError(outcome.offer);
      case 'already_accepted':
        throw new BusinessException(
          'OFFER_ALREADY_ACCEPTED',
          'This offer has already been accepted.',
          { offer_id: outcome.offer.offer_id },
          HttpStatus.CONFLICT,
        );
      case 'declined':
        throw new BusinessException(
          'OFFER_ALREADY_DECLINED',
          'This offer has already been declined.',
          { offer_id: outcome.offer.offer_id },
          HttpStatus.CONFLICT,
        );
      default:
        throw new BusinessException(
          'OFFER_STATUS_CONFLICT',
          'Another user has already processed this offer. Refresh and try again.',
          { offer_id: outcome.offer.offer_id },
          HttpStatus.CONFLICT,
        );
    }
  }

  /**
   * Declines an outstanding offer — or an accepted one, provided no admission
   * payment or confirmation exists yet (refunds are outside this module). The
   * application is cancelled and the seat released.
   */
  async decline(
    actor: AdmissionPlatformUser,
    applicationId: number,
    dto: DeclineOfferDto,
  ) {
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lookup.lockApplication(actor.institute_id, applicationId, tx);
      const offer = await this.requireOffer(tx, applicationId);

      if (offer.status === 'declined')
        return { kind: 'declined' as const, offer };
      if (offer.status === 'expired')
        return { kind: 'expired' as const, offer };
      if (offer.status === 'offered' && offer.offer_expiry_date <= now) {
        const flipped = await this.expireOne(
          tx,
          offer.offer_id,
          applicationId,
          now,
        );
        return { kind: 'expired_now' as const, offer, flipped };
      }
      if (offer.status === 'accepted') {
        const [payments, confirmation] = await Promise.all([
          tx.admissionPayment.count({
            where: { application_id: applicationId },
          }),
          tx.admissionConfirmation.count({
            where: { application_id: applicationId },
          }),
        ]);
        if (payments > 0 || confirmation > 0)
          return { kind: 'locked' as const, offer };
      }

      const wasStatus = offer.status;
      const declined = await tx.admissionOffer.updateMany({
        where: {
          offer_id: offer.offer_id,
          status: { in: ['offered', 'accepted'] },
        },
        data: {
          status: 'declined',
          responded_by: actor.eddva_user_id,
          responded_at: now,
          response_note: dto.reason,
        },
      });
      if (declined.count === 0) return { kind: 'conflict' as const, offer };
      await moveApplicationStatusOrConflict(
        tx,
        applicationId,
        ['offered'],
        'cancelled',
      );
      return { kind: 'declined_now' as const, offer, wasStatus };
    });

    switch (outcome.kind) {
      case 'declined_now':
        await this.audit.log(actor, {
          entityType: ADM_ENTITY.OFFER,
          entityId: String(outcome.offer.offer_id),
          action: 'decline',
          oldStatus: outcome.wasStatus,
          newStatus: 'declined',
          reason: dto.reason,
          metadata: { application_id: applicationId },
        });
        await this.audit.log(actor, {
          entityType: ADM_ENTITY.APPLICATION,
          entityId: String(applicationId),
          action: 'status_change',
          oldStatus: 'offered',
          newStatus: 'cancelled',
          reason: dto.reason ?? 'Offer declined',
          metadata: {
            application_id: applicationId,
            offer_id: outcome.offer.offer_id,
          },
        });
        return this.getForApplication(actor.institute_id, applicationId);
      case 'expired_now':
        if (outcome.flipped)
          await this.recordExpiry(
            actor.institute_id,
            outcome.offer.offer_id,
            applicationId,
          );
        throw this.expiredError(outcome.offer);
      case 'expired':
        throw this.expiredError(outcome.offer);
      case 'declined':
        throw new BusinessException(
          'OFFER_ALREADY_DECLINED',
          'This offer has already been declined.',
          { offer_id: outcome.offer.offer_id },
          HttpStatus.CONFLICT,
        );
      case 'locked':
        throw new BusinessException(
          'OFFER_CANNOT_BE_DECLINED',
          'This offer can no longer be declined: an admission payment or confirmation already exists. Contact accounts to process a refund/cancellation.',
          { offer_id: outcome.offer.offer_id },
        );
      default:
        throw new BusinessException(
          'OFFER_STATUS_CONFLICT',
          'Another user has already processed this offer. Refresh and try again.',
          { offer_id: outcome.offer.offer_id },
          HttpStatus.CONFLICT,
        );
    }
  }

  private expiredError(offer: AdmissionOffer) {
    return new BusinessException(
      'OFFER_EXPIRED',
      'This offer has already expired.',
      { offer_id: offer.offer_id, offer_expiry_date: offer.offer_expiry_date },
    );
  }

  private async requireOffer(
    tx: Prisma.TransactionClient,
    applicationId: number,
  ) {
    const offer = await tx.admissionOffer.findUnique({
      where: { application_id: applicationId },
    });
    if (!offer) {
      throw new NotFoundException(`Application #${applicationId} has no offer`);
    }
    return offer;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getForApplication(instituteId: string, applicationId: number) {
    await this.lookup.application(instituteId, applicationId);
    const offer = await this.prisma.admissionOffer.findUnique({
      where: { application_id: applicationId },
      include: OFFER_INCLUDE,
    });
    if (!offer)
      throw new NotFoundException(`Application #${applicationId} has no offer`);
    return withCountdown(offer);
  }

  async findOne(instituteId: string, id: number) {
    const offer = await this.prisma.admissionOffer.findFirst({
      where: {
        offer_id: id,
        application: { institute_id: instituteId, deleted_at: null },
      },
      include: OFFER_INCLUDE,
    });
    if (!offer) throw new NotFoundException(`Offer #${id} not found`);
    return withCountdown(offer);
  }

  async findAll(instituteId: string, query: QueryOfferDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'created_at');
    const now = new Date();

    const where: Prisma.AdmissionOfferWhereInput = {
      status: query.status,
      offer_date: buildDateRange(query.from, query.to),
      ...(query.expiring_within_days
        ? {
            status: 'offered',
            offer_expiry_date: {
              gt: now,
              lte: new Date(
                now.getTime() +
                  query.expiring_within_days * 24 * 60 * 60 * 1000,
              ),
            },
          }
        : {}),
      application: {
        institute_id: instituteId,
        deleted_at: null,
        program_id: query.program_id,
        session_id: query.session_id,
        ...(query.search
          ? {
              OR: [
                {
                  application_number: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  applicant: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admissionOffer.findMany({
        where,
        include: OFFER_INCLUDE,
        orderBy: { [sortBy]: parseSortOrder(query.sortOrder) },
        skip,
        take,
      }),
      this.prisma.admissionOffer.count({ where }),
    ]);
    return {
      data: rows.map((r) => withCountdown(r, now)),
      pagination: buildMeta(total, page, limit),
    };
  }
}
