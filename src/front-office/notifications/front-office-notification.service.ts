import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FrontOfficeNotificationChannel,
  FrontOfficeNotificationEntityType,
} from '@prisma/client';

export interface SendFoNotificationParams {
  entityType: FrontOfficeNotificationEntityType;
  entityId: number;
  eventType: string;
  recipientEmployeeId?: number | null;
  channel?: FrontOfficeNotificationChannel;
  message?: string;
}

/**
 * Single shared notification mechanism for all four Front Office
 * sub-modules (visitor/enquiry/appointment/complaint) — one implementation,
 * not four. Follows the same "Phase 1: DB-log only" convention already
 * established by LibNotificationService/SportsNotificationService in this
 * codebase (no SMS/email provider exists anywhere in the project yet).
 *
 * Notification failures must never roll back the calling business
 * transaction, so every public method swallows its own errors.
 */
@Injectable()
export class FrontOfficeNotificationService {
  private readonly logger = new Logger(FrontOfficeNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(params: SendFoNotificationParams): Promise<void> {
    try {
      await this.prisma.frontOfficeNotification.create({
        data: {
          entity_type: params.entityType,
          entity_id: params.entityId,
          event_type: params.eventType,
          recipient_employee_id: params.recipientEmployeeId ?? null,
          channel: params.channel ?? 'email',
          status: 'sent',
          message: params.message,
          sent_at: new Date(),
        },
      });
    } catch (err) {
      // Best-effort: a notification failure must not fail the caller's transaction.
      this.logger.error(`Failed to record notification (${params.eventType})`, err as Error);
      try {
        await this.prisma.frontOfficeNotification.create({
          data: {
            entity_type: params.entityType,
            entity_id: params.entityId,
            event_type: params.eventType,
            recipient_employee_id: params.recipientEmployeeId ?? null,
            channel: params.channel ?? 'email',
            status: 'failed',
            message: params.message,
          },
        });
      } catch {
        /* genuinely nothing more we can do */
      }
    }
  }

  async findAll(filters: { entityType?: string; entityId?: number; recipientEmployeeId?: number }) {
    return this.prisma.frontOfficeNotification.findMany({
      where: {
        entity_type: filters.entityType as FrontOfficeNotificationEntityType | undefined,
        entity_id: filters.entityId,
        recipient_employee_id: filters.recipientEmployeeId,
      },
      include: { recipient: { select: { employee_id: true, name: true, email: true } } },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }
}
