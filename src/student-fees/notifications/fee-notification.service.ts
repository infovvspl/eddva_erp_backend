import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface QueueFeeNotification {
  instituteId: string;
  entityType: string;
  entityId: number;
  eventType: string;
  recipient?: string | null;
  channel?: string;
  message?: string;
}

/** DB-logged notification outbox — same "log only" convention as every other module here. */
@Injectable()
export class FeeNotificationService {
  private readonly logger = new Logger(FeeNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async queueMany(items: QueueFeeNotification[]): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.prisma.feeNotification.createMany({
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
      this.logger.error(`Failed to record ${items.length} fee notification(s)`, err as Error);
    }
  }
}
