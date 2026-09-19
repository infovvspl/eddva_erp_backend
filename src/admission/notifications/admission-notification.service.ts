import { Injectable, Logger } from '@nestjs/common';
import {
  AdmissionNotificationChannel,
  AdmissionNotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildMeta, parsePagination } from '../common/pagination.util';

export interface QueueAdmissionNotification {
  instituteId: string;
  entityType: string;
  entityId: number;
  eventType: string;
  recipient?: string | null;
  channel?: AdmissionNotificationChannel;
  message?: string;
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
  event_type?: string;
  entity_type?: string;
  entity_id?: number;
  status?: AdmissionNotificationStatus;
}

/**
 * DB-logged notification outbox — same "Phase 1: log only" convention as the
 * Library/Sports/Front Office notification services: no SMS/email provider
 * exists in this codebase, so rows are recorded as `queued` and are never
 * marked `sent` until a real delivery worker exists.
 *
 * Notification failures must never roll back the calling business operation,
 * so every write here swallows its own errors.
 */
@Injectable()
export class AdmissionNotificationService {
  private readonly logger = new Logger(AdmissionNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async queue(params: QueueAdmissionNotification): Promise<void> {
    await this.queueMany([params]);
  }

  async queueMany(items: QueueAdmissionNotification[]): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.prisma.admissionNotification.createMany({
        data: items.map((n) => ({
          institute_id: n.instituteId,
          entity_type: n.entityType,
          entity_id: n.entityId,
          event_type: n.eventType,
          channel: n.channel ?? 'email',
          recipient: n.recipient ?? null,
          message: n.message,
          status: 'queued' as const,
        })),
      });
    } catch (err) {
      this.logger.error(
        `Failed to record ${items.length} admission notification(s)`,
        err as Error,
      );
    }
  }

  async findAll(instituteId: string, query: NotificationQuery) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.AdmissionNotificationWhereInput = {
      institute_id: instituteId,
      event_type: query.event_type,
      entity_type: query.entity_type,
      entity_id: query.entity_id,
      status: query.status,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.admissionNotification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.admissionNotification.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }
}
