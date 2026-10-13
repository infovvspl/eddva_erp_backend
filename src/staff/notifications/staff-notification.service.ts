import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StaffNotificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildMeta, parsePagination } from '../common/pagination.util';

export interface StaffNotificationEvent {
  instituteId: string;
  entityType: string;
  entityId: number;
  eventType: string;
  message: string;
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
  event_type?: string;
  entity_type?: string;
  entity_id?: number;
  status?: StaffNotificationStatus;
}

/**
 * DB-logged notification outbox — same "log only" convention as Hostel's:
 * no SMS/email provider exists in this codebase, so rows are recorded as
 * `queued` and are never marked `sent` until a real delivery worker exists.
 *
 * Notification failures must never roll back the calling business operation,
 * so every write here swallows and logs its own errors.
 */
@Injectable()
export class StaffNotificationService {
  private readonly logger = new Logger(StaffNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async createMany(rows: Prisma.StaffNotificationCreateManyInput[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.prisma.staffNotification.createMany({ data: rows });
    } catch (err) {
      this.logger.error(`Failed to record ${rows.length} staff notification(s)`, err as Error);
    }
  }

  /**
   * In-app notice. `recipientUserIds` are eddva_user_ids; a null/undefined
   * entry means "any HR/admin of the institute" (no specific staff login to
   * target — this module has no staff self-service portal yet).
   */
  async notify(
    event: StaffNotificationEvent,
    recipientUserIds: Array<string | null | undefined> = [null],
  ): Promise<void> {
    const targets = [...new Set(recipientUserIds.map((r) => r ?? null))];
    await this.createMany(
      (targets.length > 0 ? targets : [null]).map((recipient) => ({
        institute_id: event.instituteId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        event_type: event.eventType,
        message: event.message,
        channel: 'in_app',
        recipient,
        status: 'queued' as const,
      })),
    );
  }

  /** Self-service view: a teacher's own targeted notices, plus institute-wide broadcasts (recipient null). */
  async findForRecipient(instituteId: string, recipientUserId: string, query: NotificationQuery) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.StaffNotificationWhereInput = {
      institute_id: instituteId,
      event_type: query.event_type,
      OR: [{ recipient: recipientUserId }, { recipient: null }],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.staffNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.staffNotification.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findAll(instituteId: string, query: NotificationQuery) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.StaffNotificationWhereInput = {
      institute_id: instituteId,
      event_type: query.event_type,
      entity_type: query.entity_type,
      entity_id: query.entity_id,
      status: query.status,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.staffNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.staffNotification.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }
}
