import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LibFinesService } from '../fines/lib-fines.service';
import { LibNotificationService } from '../notifications/lib-notification.service';
import { diffDays } from '../../common/utils/date.util';

@Injectable()
export class LibSchedulerService {
  private readonly logger = new Logger(LibSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finesService: LibFinesService,
    private readonly notificationService: LibNotificationService,
  ) {}

  /**
   * Daily job — runs at midnight every day.
   * Steps per architecture: mark overdue → compute fines → notify → expire reservations.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyLibraryJob() {
    this.logger.log('[Library Scheduler] Daily job started');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Step 1: Mark overdue issues
      const overdueResult = await this.prisma.libIssueRecord.updateMany({
        where: {
          status: 'issued',
          due_date: { lt: today },
        },
        data: { status: 'overdue' },
      });
      this.logger.log(`[Library Scheduler] Marked ${overdueResult.count} issue(s) as overdue`);

      // Step 2: Compute fines for overdue records that don't have a pending fine yet
      const overdueIssues = await this.prisma.libIssueRecord.findMany({
        where: {
          status: 'overdue',
          fines: { none: { reason: 'overdue', status: { in: ['pending', 'partially_paid'] } } },
        },
      });

      let finesCreated = 0;
      for (const issue of overdueIssues) {
        // Rows not yet assigned to an institute are skipped: a fine must belong to a school.
        if (!issue.institute_id) continue;
        const rawOverdue = diffDays(today, new Date(issue.due_date));
        const overdueDays = Math.max(0, rawOverdue - issue.grace_period_days);
        if (overdueDays <= 0) continue;

        const finePerDay = Number(issue.fine_per_day);
        const maxCap = issue.max_fine_cap ? Number(issue.max_fine_cap) : null;
        const amount = this.finesService.calculateFine(overdueDays, finePerDay, maxCap);

        await this.finesService.createFine(issue.institute_id, issue.issue_id, issue.member_id, 'overdue', amount);

        // Step 3: Notify overdue
        await this.notificationService.sendOverdueAlert(issue.member_id, issue.issue_id);
        finesCreated++;
      }
      this.logger.log(`[Library Scheduler] Created ${finesCreated} fine(s)`);

      // Step 4: Expire uncollected reservations
      const expiredReservations = await this.prisma.libReservation.updateMany({
        where: {
          status: { in: ['pending', 'ready_for_pickup'] },
          expiry_date: { lt: today },
        },
        data: { status: 'expired' },
      });
      this.logger.log(`[Library Scheduler] Expired ${expiredReservations.count} reservation(s)`);
    } catch (err) {
      this.logger.error('[Library Scheduler] Daily job failed', err);
    }

    this.logger.log('[Library Scheduler] Daily job completed');
  }
}
