import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlumniEventPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { isAlumniPrincipal } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import {
  ALUMNI_CONTACT_SELECT,
  summaryFor,
  viewerOf,
} from '../common/alumni-profile.view';
import { SEAT_HOLDING_STATUSES } from '../common/alumni-state';
import { BusinessException } from '../common/business-exception';
import { buildMeta, parsePagination } from '../common/pagination.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import {
  CancelRegistrationDto,
  MarkEventAttendanceDto,
  QueryRegistrationDto,
  RegisterForEventDto,
} from './dto/event.dto';
import {
  effectiveEventStatus,
  eventEnd,
  registrationClosesAt,
} from './events.service';

const EVENT_BRIEF = {
  event_id: true,
  title: true,
  event_type: true,
  mode: true,
  event_date: true,
  status: true,
  is_paid: true,
  ticket_price: true,
} satisfies Prisma.AlumniEventSelect;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  /**
   * Alumni act for themselves; staff name the alumnus. An alumnus who names
   * someone else is refused rather than silently redirected to themselves.
   */
  private targetAlumni(
    actor: AlumniPlatformUser,
    requested: number | undefined,
  ): number {
    if (isAlumniPrincipal(actor)) {
      if (requested !== undefined && requested !== actor.alumni_id) {
        throw new ForbiddenException(
          'You can only manage your own event registrations',
        );
      }
      return actor.alumni_id as number;
    }
    if (requested === undefined) {
      throw new BusinessException(
        'ALUMNI_ID_REQUIRED',
        'alumni_id is required when acting on behalf of an alumnus',
        undefined,
        400,
      );
    }
    return requested;
  }

  // ─── Register / cancel ───────────────────────────────────────────────────

  /**
   * Seat allocation is serialised per event: the event row is locked
   * (`SELECT … FOR UPDATE`) inside the transaction, seats are counted under that
   * lock, and the registration is written before the lock is released — so
   * concurrent requests can never over-book, and no client-side check is relied on.
   */
  async register(
    actor: AlumniPlatformUser,
    eventId: number,
    dto: RegisterForEventDto,
  ) {
    const alumniId = this.targetAlumni(actor, dto.alumni_id);
    if (isAlumniPrincipal(actor) && !actor.alumni_verified) {
      throw new ForbiddenException(
        'Your alumni profile must be verified before you can register for events',
      );
    }
    await this.lookup.event(actor.institute_id, eventId);
    const profile = await this.lookup.profile(actor.institute_id, alumniId);
    if (!profile.is_active) {
      throw new BusinessException(
        'ALUMNI_INACTIVE',
        'This alumni profile is deactivated',
      );
    }

    const { registration, event } = await this.prisma.$transaction(
      async (tx) => {
        await this.lookup.lock(tx, 'event', actor.institute_id, eventId);
        const locked = await this.lookup.event(actor.institute_id, eventId, tx);
        const now = new Date();

        if (locked.status === 'cancelled') {
          throw new BusinessException(
            'EVENT_CANCELLED',
            'This event has been cancelled',
          );
        }
        const status = effectiveEventStatus(locked, now);
        if (status !== 'upcoming' || now >= registrationClosesAt(locked)) {
          throw new BusinessException(
            'REGISTRATION_CLOSED',
            'Registration for this event is closed',
            { registration_closed_at: registrationClosesAt(locked) },
          );
        }

        const existing = await tx.alumniEventRegistration.findUnique({
          where: {
            event_id_alumni_id: { event_id: eventId, alumni_id: alumniId },
          },
        });
        if (existing && existing.attendance_status !== 'cancelled') {
          throw new BusinessException(
            'ALREADY_REGISTERED',
            'This alumnus is already registered for the event',
            { registration_id: existing.registration_id },
            409,
          );
        }

        if (locked.max_capacity != null) {
          const taken = await tx.alumniEventRegistration.count({
            where: {
              event_id: eventId,
              attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
            },
          });
          if (taken >= locked.max_capacity) {
            throw new BusinessException(
              'EVENT_FULL',
              'This event is full',
              { capacity: locked.max_capacity, registered: taken },
              409,
            );
          }
        }

        // A cancelled registration that had already been paid stays paid on re-registration.
        const paymentStatus: AlumniEventPaymentStatus =
          existing?.payment_status === 'paid'
            ? 'paid'
            : locked.is_paid
              ? 'pending'
              : 'not_applicable';
        const data = {
          attendance_status: 'registered' as const,
          payment_status: paymentStatus,
          amount_due: locked.ticket_price,
          registered_at: now,
          cancelled_at: null,
          reminder_queued_at: null,
          attendance_marked_at: null,
          attendance_marked_by: null,
          registered_by: actor.eddva_user_id,
        };
        const row = existing
          ? await tx.alumniEventRegistration.update({
              where: { registration_id: existing.registration_id },
              data,
            })
          : await tx.alumniEventRegistration.create({
              data: {
                ...data,
                institute_id: actor.institute_id,
                event_id: eventId,
                alumni_id: alumniId,
              },
            });
        return { registration: row, event: locked };
      },
    );

    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.REGISTRATION,
      entityId: String(registration.registration_id),
      action: 'register',
      newStatus: 'registered',
      metadata: { event_id: eventId, alumni_id: alumniId },
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.REGISTRATION,
        entityId: registration.registration_id,
        eventType: 'event_registration_confirmed',
        message: event.is_paid
          ? `You are registered for "${event.title}". Payment of ${String(event.ticket_price)} is pending.`
          : `You are registered for "${event.title}".`,
      },
      { alumni_id: alumniId, email: profile.email },
    );
    return registration;
  }

  async cancelRegistration(
    actor: AlumniPlatformUser,
    eventId: number,
    dto: CancelRegistrationDto,
  ) {
    const alumniId = this.targetAlumni(actor, dto.alumni_id);
    const event = await this.lookup.event(actor.institute_id, eventId);
    const registration = await this.prisma.alumniEventRegistration.findUnique({
      where: { event_id_alumni_id: { event_id: eventId, alumni_id: alumniId } },
      include: { alumni: { select: { email: true } } },
    });
    if (!registration || registration.institute_id !== actor.institute_id) {
      throw new NotFoundException('No registration found for this event');
    }
    if (registration.attendance_status !== 'registered') {
      throw new BusinessException(
        'REGISTRATION_NOT_CANCELLABLE',
        `A registration in status "${registration.attendance_status}" cannot be cancelled`,
        { status: registration.attendance_status },
      );
    }
    if (isAlumniPrincipal(actor) && event.event_date.getTime() <= Date.now()) {
      throw new BusinessException(
        'EVENT_STARTED',
        'Registration cannot be cancelled after the event has started',
      );
    }
    // Compare-and-set so a double click cancels once and attendance marking can't race it.
    const { count } = await this.prisma.alumniEventRegistration.updateMany({
      where: {
        registration_id: registration.registration_id,
        attendance_status: 'registered',
      },
      data: { attendance_status: 'cancelled', cancelled_at: new Date() },
    });
    if (count === 0) {
      throw new BusinessException(
        'REGISTRATION_NOT_CANCELLABLE',
        'This registration changed while you were cancelling it; please retry',
        undefined,
        409,
      );
    }
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.REGISTRATION,
      entityId: String(registration.registration_id),
      action: 'cancel',
      oldStatus: 'registered',
      newStatus: 'cancelled',
      metadata: { event_id: eventId, alumni_id: alumniId },
    });
    await this.notifications.notifyAlumni(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.REGISTRATION,
        entityId: registration.registration_id,
        eventType: 'event_registration_cancelled',
        message: `Your registration for "${event.title}" was cancelled.`,
      },
      { alumni_id: alumniId, email: registration.alumni.email },
    );
    return {
      registration_id: registration.registration_id,
      attendance_status: 'cancelled',
      // No payment gateway exists, so a refund of a paid ticket is settled offline.
      refund_note:
        registration.payment_status === 'paid'
          ? 'This ticket was paid; contact the alumni office to arrange a refund'
          : undefined,
    };
  }

  // ─── Reads ───────────────────────────────────────────────────────────────

  /** Attendee list of one event (staff). */
  async listForEvent(
    actor: AlumniPlatformUser,
    eventId: number,
    query: QueryRegistrationDto,
  ) {
    await this.lookup.event(actor.institute_id, eventId);
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniEventRegistrationWhereInput = {
      event_id: eventId,
      institute_id: actor.institute_id,
      attendance_status: query.attendance_status,
      payment_status: query.payment_status,
      ...(query.search
        ? {
            alumni: {
              OR: [
                {
                  full_name: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  email: { contains: query.search.trim(), mode: 'insensitive' },
                },
              ],
            },
          }
        : {}),
    };
    const viewer = viewerOf(actor);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniEventRegistration.findMany({
        where,
        orderBy: [{ registered_at: 'asc' }, { registration_id: 'asc' }],
        skip,
        take,
        include: {
          alumni: { select: ALUMNI_CONTACT_SELECT },
          payment: true,
        },
      }),
      this.prisma.alumniEventRegistration.count({ where }),
    ]);
    return {
      data: rows.map(({ alumni, ...row }) => ({
        ...row,
        alumni: summaryFor(viewer, alumni),
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  /** Registrations across events: staff see any (filterable), an alumnus only their own. */
  async findAll(actor: AlumniPlatformUser, query: QueryRegistrationDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniEventRegistrationWhereInput = {
      institute_id: actor.institute_id,
      attendance_status: query.attendance_status,
      payment_status: query.payment_status,
      event_id: query.event_id,
      alumni_id: isAlumniPrincipal(actor) ? actor.alumni_id : query.alumni_id,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniEventRegistration.findMany({
        where,
        orderBy: { registered_at: 'desc' },
        skip,
        take,
        include: { event: { select: EVENT_BRIEF }, payment: true },
      }),
      this.prisma.alumniEventRegistration.count({ where }),
    ]);
    return { data: rows, pagination: buildMeta(total, page, limit) };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const row = await this.prisma.alumniEventRegistration.findFirst({
      where: {
        registration_id: id,
        institute_id: actor.institute_id,
        ...(isAlumniPrincipal(actor) ? { alumni_id: actor.alumni_id } : {}),
      },
      include: { event: { select: EVENT_BRIEF }, payment: true },
    });
    if (!row)
      throw new NotFoundException(`Event registration #${id} not found`);
    return row;
  }

  // ─── Attendance ──────────────────────────────────────────────────────────

  /** Bulk (or single) attendance marking — all-or-nothing, each change audited. */
  async markAttendance(
    actor: AlumniPlatformUser,
    eventId: number,
    dto: MarkEventAttendanceDto,
  ) {
    const event = await this.lookup.event(actor.institute_id, eventId);
    const now = new Date();
    if (event.status === 'cancelled') {
      throw new BusinessException(
        'EVENT_CANCELLED',
        'This event has been cancelled',
      );
    }
    if (event.event_date.getTime() > now.getTime()) {
      throw new BusinessException(
        'EVENT_NOT_STARTED',
        'Attendance can only be marked once the event has started',
        { event_date: event.event_date },
      );
    }
    const ids = dto.records.map((r) => r.registration_id);
    if (new Set(ids).size !== ids.length) {
      throw new BusinessException(
        'DUPLICATE_RECORDS',
        'Each registration may appear only once per request',
        undefined,
        400,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const regs = await tx.alumniEventRegistration.findMany({
        where: {
          registration_id: { in: ids },
          event_id: eventId,
          institute_id: actor.institute_id,
        },
      });
      const byId = new Map(regs.map((r) => [r.registration_id, r]));
      const errors: Array<{ registration_id: number; error: string }> = [];
      for (const rec of dto.records) {
        const reg = byId.get(rec.registration_id);
        if (!reg) {
          errors.push({
            registration_id: rec.registration_id,
            error: 'not found for this event',
          });
        } else if (reg.attendance_status === 'cancelled') {
          errors.push({
            registration_id: rec.registration_id,
            error: 'registration is cancelled',
          });
        } else if (
          rec.status === 'attended' &&
          event.is_paid &&
          reg.payment_status !== 'paid'
        ) {
          errors.push({
            registration_id: rec.registration_id,
            error: 'ticket payment has not been confirmed',
          });
        }
      }
      if (errors.length > 0) {
        throw new BusinessException(
          'ATTENDANCE_REJECTED',
          'Some records cannot be applied; nothing was changed',
          { errors },
        );
      }
      const changed: Array<{
        registration_id: number;
        from: string;
        to: string;
      }> = [];
      for (const rec of dto.records) {
        const reg = byId.get(rec.registration_id)!;
        if (reg.attendance_status === rec.status) continue;
        // Guard on the previous status so a concurrent cancellation is not overwritten.
        const { count } = await tx.alumniEventRegistration.updateMany({
          where: {
            registration_id: reg.registration_id,
            attendance_status: reg.attendance_status,
          },
          data: {
            attendance_status: rec.status,
            attendance_marked_at: now,
            attendance_marked_by: actor.eddva_user_id,
          },
        });
        if (count === 0) {
          throw new BusinessException(
            'ATTENDANCE_CONFLICT',
            `Registration #${reg.registration_id} changed while marking; retry`,
            undefined,
            409,
          );
        }
        changed.push({
          registration_id: reg.registration_id,
          from: reg.attendance_status,
          to: rec.status,
        });
      }
      return changed;
    });

    for (const c of result) {
      await this.audit.log(actor, {
        entityType: ALUMNI_ENTITY.REGISTRATION,
        entityId: String(c.registration_id),
        action: 'attendance',
        oldStatus: c.from,
        newStatus: c.to,
        metadata: { event_id: eventId },
      });
    }
    return {
      event_id: eventId,
      requested: dto.records.length,
      changed: result.length,
      unchanged: dto.records.length - result.length,
    };
  }

  /** After the event: everyone still "registered" (never marked) becomes a no-show. */
  async markNoShows(actor: AlumniPlatformUser, eventId: number) {
    const event = await this.lookup.event(actor.institute_id, eventId);
    if (event.status === 'cancelled') {
      throw new BusinessException(
        'EVENT_CANCELLED',
        'This event has been cancelled',
      );
    }
    if (eventEnd(event).getTime() > Date.now()) {
      throw new BusinessException(
        'EVENT_NOT_ENDED',
        'No-shows can only be identified once the event has ended',
        { ends_at: eventEnd(event) },
      );
    }
    const pending = await this.prisma.alumniEventRegistration.findMany({
      where: {
        event_id: eventId,
        institute_id: actor.institute_id,
        attendance_status: 'registered',
      },
      select: { registration_id: true },
    });
    const ids = pending.map((p) => p.registration_id);
    const { count } = await this.prisma.alumniEventRegistration.updateMany({
      where: { registration_id: { in: ids }, attendance_status: 'registered' },
      data: {
        attendance_status: 'no_show',
        attendance_marked_at: new Date(),
        attendance_marked_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT,
      entityId: String(eventId),
      action: 'mark_no_shows',
      oldStatus: 'registered',
      newStatus: 'no_show',
      metadata: { count, registration_ids: ids },
    });
    return { event_id: eventId, marked_no_show: count };
  }
}
