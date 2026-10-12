import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaveBalancesService } from '../leave-balances/leave-balances.service';
import { StaffLmsSyncService } from '../lms-sync/staff-lms-sync.service';

/**
 * Background sweeps on the app's existing @nestjs/schedule setup — same
 * mechanism as HostelScheduler/AlumniScheduler. Both jobs are idempotent and
 * independently guarded, so a missed or repeated run is always safe:
 *  - leave balance accrual: unique staff+leave_type+year constraint + `skipDuplicates`.
 *  - LMS retry: only still-`pending` teaching staff are re-pushed.
 */
@Injectable()
export class StaffScheduler {
  private readonly logger = new Logger(StaffScheduler.name);
  private leaveBalanceSweepRunning = false;
  private lmsSweepRunning = false;

  constructor(
    private readonly leaveBalances: LeaveBalancesService,
    private readonly lmsSync: StaffLmsSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async leaveBalanceSweep() {
    if (this.leaveBalanceSweepRunning) return;
    this.leaveBalanceSweepRunning = true;
    try {
      const n = await this.leaveBalances.ensureBalancesForAllInstitutes();
      if (n > 0) this.logger.log(`Leave balance accrual sweep: ${n} row(s) created`);
    } catch (err) {
      this.logger.error('Leave balance accrual sweep failed', err as Error);
    } finally {
      this.leaveBalanceSweepRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async lmsRetrySweep() {
    if (this.lmsSweepRunning) return;
    this.lmsSweepRunning = true;
    try {
      const n = await this.lmsSync.retryPending();
      if (n > 0) this.logger.log(`Staff LMS retry sweep: ${n} teacher(s) attempted`);
    } catch (err) {
      this.logger.error('Staff LMS retry sweep failed', err as Error);
    } finally {
      this.lmsSweepRunning = false;
    }
  }
}
