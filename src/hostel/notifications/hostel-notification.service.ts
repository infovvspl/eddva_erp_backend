import { Injectable, Logger } from '@nestjs/common';
import {
  HostelNotificationAudience,
  HostelNotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildMeta, parsePagination } from '../common/pagination.util';

export interface HostelNotificationEvent {
  instituteId: string;
  entityType: string;
  entityId: number;
  eventType: string;
  message: string;
}

export interface GuardianContact {
  guardian_phone?: string | null;
  guardian_email?: string | null;
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
  event_type?: string;
  entity_type?: string;
  entity_id?: number;
  audience?: HostelNotificationAudience;
  status?: HostelNotificationStatus;
}

/**
 * DB-logged notification outbox — same "log only" convention as the Admission /
 * Library / Front Office notification services: no SMS/email provider exists in
 * this codebase, so rows are recorded as `queued` and are never marked `sent`
 * until a real delivery worker exists.
 *
 * Notification failures must never roll back the calling business operation
 * (a gate scan must succeed even if the outbox write fails), so every write
 * here swallows and logs its own errors.
 */
@Injectable()
export class HostelNotificationService {
  private readonly logger = new Logger(HostelNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async createMany(
    rows: Prisma.HostelNotificationCreateManyInput[],
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.prisma.hostelNotification.createMany({ data: rows });
    } catch (err) {
      this.logger.error(
        `Failed to record ${rows.length} hostel notification(s)`,
        err as Error,
      );
    }
  }

  /** SMS to the guardian's phone and/or email to the guardian's address, whichever the resident has on file. */
  async notifyGuardian(
    event: HostelNotificationEvent,
    guardian: GuardianContact,
  ): Promise<void> {
    const rows: Prisma.HostelNotificationCreateManyInput[] = [];
    const base = {
      institute_id: event.instituteId,
      entity_type: event.entityType,
      entity_id: event.entityId,
      event_type: event.eventType,
      message: event.message,
      audience: 'guardian' as const,
      status: 'queued' as const,
    };
    if (guardian.guardian_phone) {
      rows.push({
        ...base,
        channel: 'sms',
        recipient: guardian.guardian_phone,
      });
    }
    if (guardian.guardian_email) {
      rows.push({
        ...base,
        channel: 'email',
        recipient: guardian.guardian_email,
      });
    }
    await this.createMany(rows);
  }

  /**
   * In-app notice for hostel staff. `recipientUserIds` are eddva_user_ids (e.g.
   * the block warden); a null entry means "any warden/admin of the institute".
   */
  async notifyStaff(
    event: HostelNotificationEvent,
    recipientUserIds: Array<string | null | undefined>,
  ): Promise<void> {
    const targets = [...new Set(recipientUserIds.map((r) => r ?? null))];
    await this.createMany(
      (targets.length > 0 ? targets : [null]).map((recipient) => ({
        institute_id: event.instituteId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        event_type: event.eventType,
        message: event.message,
        audience: 'staff' as const,
        channel: 'in_app' as const,
        recipient,
        status: 'queued' as const,
      })),
    );
  }

  async findAll(instituteId: string, query: NotificationQuery) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.HostelNotificationWhereInput = {
      institute_id: instituteId,
      event_type: query.event_type,
      entity_type: query.entity_type,
      entity_id: query.entity_id,
      audience: query.audience,
      status: query.status,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.hostelNotification.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }
}
