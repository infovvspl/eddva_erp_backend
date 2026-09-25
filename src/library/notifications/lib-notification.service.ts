import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

/**
 * NotificationService — architecture-named dedicated service.
 * Phase 1: writes DB records only (library_notification_logs).
 * Phase 2 upgrade: swap log() body with nodemailer/SMS — zero controller changes.
 */
@Injectable()
export class LibNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async log(member_id: number, event_type: string, ref_id?: number): Promise<void> {
    await this.prisma.libNotificationLog.create({
      data: { member_id, event_type, ref_id },
    });
  }

  // Named helper methods for clarity at call sites
  async sendDueDateReminder(member_id: number, issue_id: number) {
    await this.log(member_id, 'due_date_reminder', issue_id);
  }

  async sendOverdueAlert(member_id: number, issue_id: number) {
    await this.log(member_id, 'overdue_alert', issue_id);
  }

  async sendFineAlert(member_id: number, fine_id: number) {
    await this.log(member_id, 'fine_created', fine_id);
  }

  async sendReservationReady(member_id: number, reservation_id: number) {
    await this.log(member_id, 'reservation_ready', reservation_id);
  }

  async sendReturnConfirmation(member_id: number, issue_id: number) {
    await this.log(member_id, 'return_confirmed', issue_id);
  }

  // Logs belong to a member, so they are scoped through the member's institute.
  async findAllLogs(instituteId: string, memberId?: number) {
    const where: any = { member: { institute_id: requireInstituteId(instituteId) } };
    if (memberId) where.member_id = memberId;
    return this.prisma.libNotificationLog.findMany({
      where,
      include: {
        member: { select: { name: true, library_card_number: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
