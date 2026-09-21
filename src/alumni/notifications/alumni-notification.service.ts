import { Injectable, Logger } from '@nestjs/common';
import {
  AlumniNotificationAudience,
  AlumniNotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildMeta, parsePagination } from '../common/pagination.util';

export interface AlumniNotificationEvent {
  instituteId: string;
  entityType: string;
  entityId: number;
  eventType: string;
  message: string;
}

/** The alumnus a notice is for; `email` (when known) also queues an e-mail. */
export interface AlumniRecipient {
  alumni_id: number;
  email?: string | null;
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
  event_type?: string;
  entity_type?: string;
  entity_id?: number;
  audience?: AlumniNotificationAudience;
  status?: AlumniNotificationStatus;
  alumni_id?: number;
}

/**
 * DB-logged notification outbox — same "log only" convention as the Admission /
 * Hostel / Library notification services: no e-mail/SMS provider exists in this
 * codebase, so e-mail rows are recorded as `queued` and are never marked
 * `sent` until a real delivery worker exists. The in-app rows ARE the delivery
 * for the portal: alumni read their own through `GET me/notifications`.
 *
 * Notification failures must never roll back the calling business operation
 * (a registration must succeed even if the outbox write fails), so every write
 * here swallows and logs its own errors.
 */
@Injectable()
export class AlumniNotificationService {
  private readonly logger = new Logger(AlumniNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async createMany(
    rows: Prisma.AlumniNotificationCreateManyInput[],
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.prisma.alumniNotification.createMany({ data: rows });
    } catch (err) {
      this.logger.error(
        `Failed to record ${rows.length} alumni notification(s)`,
        err as Error,
      );
    }
  }

  private alumniRows(
    event: AlumniNotificationEvent,
    to: AlumniRecipient,
  ): Prisma.AlumniNotificationCreateManyInput[] {
    const base = {
      institute_id: event.instituteId,
      alumni_id: to.alumni_id,
      entity_type: event.entityType,
      entity_id: event.entityId,
      event_type: event.eventType,
      message: event.message,
      audience: 'alumni' as const,
      status: 'queued' as const,
    };
    const rows: Prisma.AlumniNotificationCreateManyInput[] = [
      { ...base, channel: 'in_app' },
    ];
    if (to.email) {
      rows.push({ ...base, channel: 'email', recipient: to.email });
    }
    return rows;
  }

  /** In-app notice (+ e-mail when an address is given) for one alumnus. */
  async notifyAlumni(
    event: AlumniNotificationEvent,
    to: AlumniRecipient,
  ): Promise<void> {
    await this.createMany(this.alumniRows(event, to));
  }

  /** Same notice for many alumni in one insert (event cancelled, program closed, …). */
  async notifyAlumniMany(
    event: AlumniNotificationEvent,
    recipients: AlumniRecipient[],
  ): Promise<void> {
    await this.createMany(recipients.flatMap((r) => this.alumniRows(event, r)));
  }

  /** In-app notice for alumni-office staff (no specific recipient: any officer of the institute). */
  async notifyStaff(event: AlumniNotificationEvent): Promise<void> {
    await this.createMany([
      {
        institute_id: event.instituteId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        event_type: event.eventType,
        message: event.message,
        audience: 'staff',
        channel: 'in_app',
        status: 'queued',
      },
    ]);
  }

  async findAll(instituteId: string, query: NotificationQuery) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniNotificationWhereInput = {
      institute_id: instituteId,
      event_type: query.event_type,
      entity_type: query.entity_type,
      entity_id: query.entity_id,
      audience: query.audience,
      status: query.status,
      alumni_id: query.alumni_id,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.alumniNotification.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  /** An alumnus's own in-app notices — never anyone else's. */
  async findMine(
    instituteId: string,
    alumniId: number,
    query: Pick<NotificationQuery, 'page' | 'limit' | 'event_type'>,
  ) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AlumniNotificationWhereInput = {
      institute_id: instituteId,
      alumni_id: alumniId,
      channel: 'in_app',
      audience: 'alumni',
      event_type: query.event_type,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        select: {
          notification_id: true,
          entity_type: true,
          entity_id: true,
          event_type: true,
          message: true,
          created_at: true,
        },
      }),
      this.prisma.alumniNotification.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }
}
