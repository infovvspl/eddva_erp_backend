import { Injectable, NotFoundException } from '@nestjs/common';
import { AlumniEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { ALUMNI_ENTITY } from '../common/alumni-entities';
import {
  AlumniFileStorageService,
  BANNER_RULES,
} from '../common/alumni-file-storage.service';
import { AlumniLookupService } from '../common/alumni-lookup.service';
import { SEAT_HOLDING_STATUSES } from '../common/alumni-state';
import { BusinessException } from '../common/business-exception';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
  parseSort,
  parseSortOrder,
} from '../common/pagination.util';
import { sqlNowUtc } from '../common/sql-time';
import { parseDateTime } from '../common/time.util';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import {
  CancelEventDto,
  CreateEventDto,
  QueryEventDto,
  UpdateEventDto,
} from './dto/event.dto';

const SORT_FIELDS = ['event_date', 'title', 'status', 'created_at'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the event is over: `ends_at`, or a day after it starts. */
export function eventEnd(
  event: Pick<AlumniEvent, 'event_date' | 'ends_at'>,
): Date {
  return event.ends_at ?? new Date(event.event_date.getTime() + DAY_MS);
}

/**
 * The status an event really has right now. The stored status is advanced by a
 * scheduled sweep, but nothing depends on the sweep having run: reads, and every
 * registration / attendance rule, use this or the raw dates.
 */
export function effectiveEventStatus(
  event: Pick<AlumniEvent, 'status' | 'event_date' | 'ends_at'>,
  now: Date = new Date(),
): AlumniEvent['status'] {
  if (event.status === 'cancelled' || event.status === 'completed') {
    return event.status;
  }
  if (eventEnd(event).getTime() <= now.getTime()) return 'completed';
  if (event.event_date.getTime() <= now.getTime()) return 'ongoing';
  return 'upcoming';
}

/** Registration closes at the deadline, or at the event start when there is none. */
export function registrationClosesAt(
  event: Pick<AlumniEvent, 'event_date' | 'registration_deadline'>,
): Date {
  return event.registration_deadline ?? event.event_date;
}

interface EventFields {
  event_date: Date;
  ends_at: Date | null;
  registration_deadline: Date | null;
  mode: AlumniEvent['mode'];
  venue: string | null;
  online_link: string | null;
  is_paid: boolean;
  ticket_price: number | null;
  max_capacity: number | null;
}

export function assertEventFields(fields: EventFields): void {
  const fail = (code: string, message: string) => {
    throw new BusinessException(code, message);
  };
  if (
    fields.registration_deadline &&
    fields.registration_deadline > fields.event_date
  ) {
    fail(
      'INVALID_EVENT_DATES',
      'registration_deadline cannot be after event_date',
    );
  }
  if (fields.ends_at && fields.ends_at <= fields.event_date) {
    fail('INVALID_EVENT_DATES', 'ends_at must be after event_date');
  }
  if (
    (fields.mode === 'offline' || fields.mode === 'hybrid') &&
    !fields.venue
  ) {
    fail('VENUE_REQUIRED', 'venue is required for offline and hybrid events');
  }
  if (
    (fields.mode === 'online' || fields.mode === 'hybrid') &&
    !fields.online_link
  ) {
    fail(
      'ONLINE_LINK_REQUIRED',
      'online_link is required for online and hybrid events',
    );
  }
  if (
    fields.is_paid &&
    !(fields.ticket_price != null && fields.ticket_price > 0)
  ) {
    fail(
      'TICKET_PRICE_REQUIRED',
      'A paid event needs a ticket_price greater than 0',
    );
  }
  if (!fields.is_paid && fields.ticket_price != null) {
    fail(
      'TICKET_PRICE_NOT_ALLOWED',
      'ticket_price is only allowed on paid events',
    );
  }
  if (fields.max_capacity != null && fields.max_capacity < 1) {
    fail('INVALID_CAPACITY', 'max_capacity must be at least 1');
  }
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AlumniLookupService,
    private readonly audit: AlumniAuditService,
    private readonly notifications: AlumniNotificationService,
    private readonly files: AlumniFileStorageService,
  ) {}

  private present(event: AlumniEvent) {
    const { banner_path, banner_mime, ...rest } = event;
    return {
      ...rest,
      effective_status: effectiveEventStatus(event),
      registration_closes_at: registrationClosesAt(event),
      has_banner: Boolean(banner_path && banner_mime),
    };
  }

  /** Number of seat-holding registrations. */
  private activeCount(eventId: number, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).alumniEventRegistration.count({
      where: {
        event_id: eventId,
        attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
      },
    });
  }

  async create(actor: AlumniPlatformUser, dto: CreateEventDto) {
    const eventDate = parseDateTime(dto.event_date, 'event_date');
    if (eventDate.getTime() <= Date.now()) {
      throw new BusinessException(
        'INVALID_EVENT_DATES',
        'event_date must be in the future',
      );
    }
    const fields: EventFields = {
      event_date: eventDate,
      ends_at: dto.ends_at ? parseDateTime(dto.ends_at, 'ends_at') : null,
      registration_deadline: dto.registration_deadline
        ? parseDateTime(dto.registration_deadline, 'registration_deadline')
        : null,
      mode: dto.mode,
      venue: dto.venue ?? null,
      online_link: dto.online_link ?? null,
      is_paid: dto.is_paid ?? false,
      ticket_price: dto.ticket_price ?? null,
      max_capacity: dto.max_capacity ?? null,
    };
    assertEventFields(fields);

    const event = await this.prisma.alumniEvent.create({
      data: {
        institute_id: actor.institute_id,
        title: dto.title,
        description: dto.description,
        event_type: dto.event_type,
        mode: fields.mode,
        venue: fields.venue,
        online_link: fields.online_link,
        event_date: fields.event_date,
        ends_at: fields.ends_at,
        registration_deadline: fields.registration_deadline,
        max_capacity: fields.max_capacity,
        is_paid: fields.is_paid,
        ticket_price:
          fields.ticket_price == null
            ? null
            : new Prisma.Decimal(fields.ticket_price),
        created_by: actor.eddva_user_id,
      },
    });
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT,
      entityId: String(event.event_id),
      action: 'create',
      newStatus: event.status,
    });
    return this.present(event);
  }

  async findAll(actor: AlumniPlatformUser, query: QueryEventDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = parseSort(query.sortBy, SORT_FIELDS, 'event_date');
    const order =
      query.sortOrder ??
      (sortBy === 'event_date' ? 'asc' : parseSortOrder(undefined));
    const now = new Date();
    const range = buildDateRange(query.from, query.to);
    const and: Prisma.AlumniEventWhereInput[] = [];
    if (query.search) {
      const term = query.search.trim();
      and.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { venue: { contains: term, mode: 'insensitive' } },
        ],
      });
    }
    if (query.registration_open) {
      and.push({
        status: 'upcoming',
        event_date: { gt: now },
        OR: [
          { registration_deadline: null },
          { registration_deadline: { gt: now } },
        ],
      });
    }
    const where: Prisma.AlumniEventWhereInput = {
      institute_id: actor.institute_id,
      event_type: query.event_type,
      mode: query.mode,
      status: query.status,
      is_paid: query.is_paid,
      ...(range ? { event_date: range } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alumniEvent.findMany({
        where,
        orderBy: [{ [sortBy]: order }, { event_id: 'asc' }],
        skip,
        take,
        include: {
          _count: {
            select: {
              registrations: {
                where: {
                  attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
                },
              },
            },
          },
        },
      }),
      this.prisma.alumniEvent.count({ where }),
    ]);
    return {
      data: rows.map(({ _count, ...event }) => ({
        ...this.present(event),
        registered_count: _count.registrations,
        seats_left:
          event.max_capacity == null
            ? null
            : Math.max(0, event.max_capacity - _count.registrations),
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  async findOne(actor: AlumniPlatformUser, id: number) {
    const event = await this.lookup.event(actor.institute_id, id);
    const registered = await this.activeCount(id);
    return {
      ...this.present(event),
      registered_count: registered,
      seats_left:
        event.max_capacity == null
          ? null
          : Math.max(0, event.max_capacity - registered),
    };
  }

  async update(actor: AlumniPlatformUser, id: number, dto: UpdateEventDto) {
    const event = await this.lookup.event(actor.institute_id, id);
    if (
      effectiveEventStatus(event) === 'cancelled' ||
      effectiveEventStatus(event) === 'completed'
    ) {
      throw new BusinessException(
        'EVENT_NOT_EDITABLE',
        `A ${effectiveEventStatus(event)} event cannot be edited`,
        { status: effectiveEventStatus(event) },
      );
    }
    const eventDate = dto.event_date
      ? parseDateTime(dto.event_date, 'event_date')
      : event.event_date;
    if (dto.event_date && eventDate.getTime() <= Date.now()) {
      throw new BusinessException(
        'INVALID_EVENT_DATES',
        'event_date must be in the future',
      );
    }
    const fields: EventFields = {
      event_date: eventDate,
      ends_at: dto.ends_at
        ? parseDateTime(dto.ends_at, 'ends_at')
        : event.ends_at,
      registration_deadline: dto.registration_deadline
        ? parseDateTime(dto.registration_deadline, 'registration_deadline')
        : event.registration_deadline,
      mode: dto.mode ?? event.mode,
      venue: dto.venue ?? event.venue,
      online_link: dto.online_link ?? event.online_link,
      is_paid: dto.is_paid ?? event.is_paid,
      ticket_price:
        dto.ticket_price ??
        (event.ticket_price ? Number(event.ticket_price) : null),
      max_capacity: dto.max_capacity ?? event.max_capacity,
    };
    // Switching a paid event to free: the price must go with it.
    if (dto.is_paid === false && dto.ticket_price === undefined) {
      fields.ticket_price = null;
    }
    assertEventFields(fields);

    const priceChanged =
      fields.is_paid !== event.is_paid ||
      (fields.ticket_price ?? null) !==
        (event.ticket_price ? Number(event.ticket_price) : null);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Serialise with registrations so the capacity / pricing checks see a stable count.
      await this.lookup.lock(tx, 'event', actor.institute_id, id);
      const registrations = await tx.alumniEventRegistration.count({
        where: { event_id: id },
      });
      if (priceChanged && registrations > 0) {
        throw new BusinessException(
          'EVENT_PRICING_LOCKED',
          'Pricing cannot change once alumni have registered',
          { registrations },
        );
      }
      if (fields.max_capacity != null) {
        const active = await this.activeCount(id, tx);
        if (fields.max_capacity < active) {
          throw new BusinessException(
            'CAPACITY_BELOW_REGISTRATIONS',
            `max_capacity cannot be below the ${active} current registration(s)`,
            { registered: active },
          );
        }
      }
      return tx.alumniEvent.update({
        where: { event_id: id },
        data: {
          title: dto.title,
          description: dto.description,
          event_type: dto.event_type,
          mode: fields.mode,
          venue: fields.venue,
          online_link: fields.online_link,
          event_date: fields.event_date,
          ends_at: fields.ends_at,
          registration_deadline: fields.registration_deadline,
          max_capacity: fields.max_capacity,
          is_paid: fields.is_paid,
          ticket_price:
            fields.ticket_price == null
              ? null
              : new Prisma.Decimal(fields.ticket_price),
          // Moving an event's dates re-derives its status (a later date can bring an ongoing event back to upcoming).
          status: effectiveEventStatus({
            status: 'upcoming',
            event_date: fields.event_date,
            ends_at: fields.ends_at,
          }),
        },
      });
    });

    const logistics = [
      'event_date',
      'ends_at',
      'mode',
      'venue',
      'online_link',
    ] as const;
    const logisticsChanged = logistics.some((k) => dto[k] !== undefined);
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT,
      entityId: String(id),
      action: 'update',
      metadata: { fields: Object.keys(dto) },
    });
    if (logisticsChanged) {
      const registrants = await this.registrantsToNotify(id);
      await this.notifications.notifyAlumniMany(
        {
          instituteId: actor.institute_id,
          entityType: ALUMNI_ENTITY.EVENT,
          entityId: id,
          eventType: 'event_updated',
          message: `"${updated.title}" was updated (date / venue / link). Please review the new details.`,
        },
        registrants,
      );
    }
    return this.present(updated);
  }

  private async registrantsToNotify(eventId: number) {
    const rows = await this.prisma.alumniEventRegistration.findMany({
      where: {
        event_id: eventId,
        attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
      },
      select: { alumni_id: true, alumni: { select: { email: true } } },
    });
    return rows.map((r) => ({ alumni_id: r.alumni_id, email: r.alumni.email }));
  }

  /**
   * Cancels the event and every open registration. Money already paid is NOT
   * returned automatically (there is no payment gateway here): paid
   * registrations keep `payment_status = paid` so finance can see who is owed a
   * refund, and are listed in the response.
   */
  async cancel(actor: AlumniPlatformUser, id: number, dto: CancelEventDto) {
    const event = await this.lookup.event(actor.institute_id, id);
    if (event.status === 'cancelled') {
      throw new BusinessException(
        'EVENT_ALREADY_CANCELLED',
        'This event is already cancelled',
        undefined,
        409,
      );
    }
    if (effectiveEventStatus(event) === 'completed') {
      throw new BusinessException(
        'EVENT_COMPLETED',
        'A completed event cannot be cancelled',
      );
    }
    const { registrants, refundDue } = await this.prisma.$transaction(
      async (tx) => {
        await this.lookup.lock(tx, 'event', actor.institute_id, id);
        await tx.alumniEvent.update({
          where: { event_id: id },
          data: {
            status: 'cancelled',
            cancelled_at: new Date(),
            cancel_reason: dto.reason,
          },
        });
        const open = await tx.alumniEventRegistration.findMany({
          where: {
            event_id: id,
            attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
          },
          select: {
            registration_id: true,
            alumni_id: true,
            payment_status: true,
            alumni: { select: { email: true } },
          },
        });
        await tx.alumniEventRegistration.updateMany({
          where: {
            event_id: id,
            attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
          },
          data: { attendance_status: 'cancelled', cancelled_at: new Date() },
        });
        return {
          registrants: open.map((r) => ({
            alumni_id: r.alumni_id,
            email: r.alumni.email,
          })),
          refundDue: open
            .filter((r) => r.payment_status === 'paid')
            .map((r) => r.registration_id),
        };
      },
    );
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT,
      entityId: String(id),
      action: 'cancel',
      oldStatus: event.status,
      newStatus: 'cancelled',
      reason: dto.reason,
      metadata: {
        registrations_cancelled: registrants.length,
        refund_due: refundDue,
      },
    });
    await this.notifications.notifyAlumniMany(
      {
        instituteId: actor.institute_id,
        entityType: ALUMNI_ENTITY.EVENT,
        entityId: id,
        eventType: 'event_cancelled',
        message: `"${event.title}" has been cancelled${dto.reason ? `: ${dto.reason}` : '.'}`,
      },
      registrants,
    );
    return {
      event_id: id,
      status: 'cancelled',
      registrations_cancelled: registrants.length,
      paid_registrations_needing_refund: refundDue,
    };
  }

  /** Hard delete is only for an event nobody registered for; otherwise cancel it. */
  async remove(actor: AlumniPlatformUser, id: number) {
    const event = await this.lookup.event(actor.institute_id, id);
    const registrations = await this.prisma.alumniEventRegistration.count({
      where: { event_id: id },
    });
    if (registrations > 0) {
      throw new BusinessException(
        'EVENT_HAS_REGISTRATIONS',
        'This event has registrations; cancel it instead of deleting it',
        { registrations },
        409,
      );
    }
    await this.prisma.alumniEvent.delete({ where: { event_id: id } });
    await this.files.remove(event.banner_path);
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT,
      entityId: String(id),
      action: 'delete',
    });
    return { event_id: id, deleted: true };
  }

  async statistics(actor: AlumniPlatformUser, id: number) {
    const event = await this.lookup.event(actor.institute_id, id);
    const [byAttendance, byPayment, revenue] = await Promise.all([
      this.prisma.alumniEventRegistration.groupBy({
        by: ['attendance_status'],
        where: { event_id: id },
        _count: { _all: true },
      }),
      this.prisma.alumniEventRegistration.groupBy({
        by: ['payment_status'],
        where: { event_id: id, attendance_status: { not: 'cancelled' } },
        _count: { _all: true },
      }),
      this.prisma.alumniEventPayment.aggregate({
        where: { registration: { event_id: id } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const att = Object.fromEntries(
      byAttendance.map((r) => [r.attendance_status, r._count._all]),
    ) as Record<string, number>;
    const pay = Object.fromEntries(
      byPayment.map((r) => [r.payment_status, r._count._all]),
    ) as Record<string, number>;
    const registered =
      (att.registered ?? 0) + (att.attended ?? 0) + (att.no_show ?? 0);
    const ended = eventEnd(event).getTime() <= Date.now();
    return {
      event_id: id,
      title: event.title,
      status: event.status,
      effective_status: effectiveEventStatus(event),
      max_capacity: event.max_capacity,
      seats_left:
        event.max_capacity == null
          ? null
          : Math.max(0, event.max_capacity - registered),
      registrations: {
        total_active: registered,
        registered: att.registered ?? 0,
        attended: att.attended ?? 0,
        no_show: att.no_show ?? 0,
        cancelled: att.cancelled ?? 0,
      },
      attendance_rate:
        registered === 0
          ? null
          : Number(((att.attended ?? 0) / registered).toFixed(4)),
      // Registered-but-never-marked once the event is over.
      unmarked_after_event: ended ? (att.registered ?? 0) : 0,
      payments: {
        is_paid_event: event.is_paid,
        paid: pay.paid ?? 0,
        pending: pay.pending ?? 0,
        not_applicable: pay.not_applicable ?? 0,
        revenue: Number(revenue._sum.amount ?? 0),
        payment_count: revenue._count._all,
      },
    };
  }

  // ─── Banner ──────────────────────────────────────────────────────────────

  async uploadBanner(
    actor: AlumniPlatformUser,
    id: number,
    file: Express.Multer.File | undefined,
  ) {
    const event = await this.lookup.event(actor.institute_id, id);
    const stored = await this.files.save(
      actor.institute_id,
      'banners',
      file,
      BANNER_RULES,
    );
    try {
      await this.prisma.alumniEvent.update({
        where: { event_id: id },
        data: { banner_path: stored.path, banner_mime: stored.mime },
      });
    } catch (err) {
      await this.files.remove(stored.path);
      throw err;
    }
    await this.files.remove(event.banner_path);
    await this.audit.log(actor, {
      entityType: ALUMNI_ENTITY.EVENT,
      entityId: String(id),
      action: 'update',
      metadata: { fields: ['banner'] },
    });
    return { event_id: id, has_banner: true };
  }

  async bannerForDownload(actor: AlumniPlatformUser, id: number) {
    const event = await this.lookup.event(actor.institute_id, id);
    if (
      !event.banner_path ||
      !event.banner_mime ||
      !(await this.files.exists(event.banner_path))
    ) {
      throw new NotFoundException('Banner not found');
    }
    return {
      absolutePath: this.files.resolve(event.banner_path),
      mime: event.banner_mime,
    };
  }

  // ─── Scheduled sweeps ────────────────────────────────────────────────────

  /** upcoming → ongoing → completed. Idempotent; nothing else depends on it having run. */
  async advanceStatuses(): Promise<{ ongoing: number; completed: number }> {
    const completed = await this.prisma.$executeRaw`
      UPDATE "alumni_events" SET "status" = 'completed', "updated_at" = ${sqlNowUtc}
      WHERE "status" IN ('upcoming', 'ongoing')
        AND COALESCE("ends_at", "event_date" + interval '1 day') <= ${sqlNowUtc}`;
    const ongoing = await this.prisma.$executeRaw`
      UPDATE "alumni_events" SET "status" = 'ongoing', "updated_at" = ${sqlNowUtc}
      WHERE "status" = 'upcoming' AND "event_date" <= ${sqlNowUtc}`;
    return { ongoing, completed };
  }

  /**
   * Queues one reminder per registration for events starting within 24h. The
   * UPDATE … RETURNING claims each registration exactly once, so overlapping
   * runs (or several app instances) cannot double-notify.
   */
  async queueReminders(): Promise<number> {
    const claimed = await this.prisma.$queryRaw<
      Array<{
        institute_id: string;
        event_id: number;
        alumni_id: number;
        title: string;
        event_date: Date;
        email: string;
      }>
    >`
      UPDATE "alumni_event_registrations" r
      SET "reminder_queued_at" = ${sqlNowUtc}
      FROM "alumni_events" e, "alumni_profiles" a
      WHERE r."event_id" = e."event_id" AND a."alumni_id" = r."alumni_id"
        AND r."reminder_queued_at" IS NULL
        AND r."attendance_status" = 'registered'
        AND e."status" = 'upcoming'
        AND e."event_date" > ${sqlNowUtc}
        AND e."event_date" <= ${sqlNowUtc} + interval '24 hours'
      RETURNING r."institute_id", e."event_id", r."alumni_id", e."title", e."event_date", a."email"`;
    for (const row of claimed) {
      await this.notifications.notifyAlumni(
        {
          instituteId: row.institute_id,
          entityType: ALUMNI_ENTITY.EVENT,
          entityId: row.event_id,
          eventType: 'event_reminder',
          message: `Reminder: "${row.title}" starts on ${row.event_date.toISOString()}.`,
        },
        { alumni_id: row.alumni_id, email: row.email },
      );
    }
    return claimed.length;
  }
}
