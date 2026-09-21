import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { AttendanceService } from '../attendance/attendance.service';
import { InvoicesService } from '../fees/invoices.service';

/**
 * Background processing, on the app's existing @nestjs/schedule setup (the same
 * mechanism as the Library and Admission schedulers) — no new scheduler or
 * queue was introduced.
 *
 * Every sweep is idempotent and its correctness never depends on the cron
 * having run: the alert APIs compute overdue passes / unaccounted absences live,
 * and scan / payment rules are enforced synchronously. The sweeps only persist
 * the state change (out → overdue, approved → expired) and queue notifications,
 * exactly once per item.
 *
 * A job that is still running when its next tick fires is skipped rather than
 * stacked (single-instance guard; use a DB advisory lock if the app is ever run
 * as several replicas).
 */
@Injectable()
export class HostelScheduler {
  private readonly logger = new Logger(HostelScheduler.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly gatePasses: GatePassesService,
    private readonly attendance: AttendanceService,
    private readonly invoices: InvoicesService,
  ) {}

  private async guarded(name: string, job: () => Promise<void>) {
    if (this.running.has(name)) {
      this.logger.warn(`${name} is still running; skipping this tick`);
      return;
    }
    this.running.add(name);
    try {
      await job();
    } catch (err) {
      this.logger.error(`${name} failed`, err as Error);
    } finally {
      this.running.delete(name);
    }
  }

  /** Safety-critical: a resident who has not come back is flagged within five minutes. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  gatePassSweep() {
    return this.guarded('gate-pass-sweep', async () => {
      const overdue = await this.gatePasses.markOverduePasses();
      const expired = await this.gatePasses.expireUnusedPasses();
      if (overdue > 0 || expired > 0) {
        this.logger.log(
          `Gate pass sweep: ${overdue} overdue, ${expired} expired`,
        );
      }
    });
  }

  /** Catches absences marked while the alert path was unavailable (yesterday + today). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  absenceSweep() {
    return this.guarded('absence-sweep', async () => {
      const raised = await this.attendance.sweepUnaccountedAbsences();
      if (raised > 0)
        this.logger.log(`Absence sweep: ${raised} alert(s) raised`);
    });
  }

  /** One "fee overdue" notice per newly-overdue invoice. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  feeSweep() {
    return this.guarded('fee-sweep', async () => {
      const queued = await this.invoices.notifyOverdueInvoices();
      if (queued > 0)
        this.logger.log(`Fee sweep: ${queued} overdue notice(s) queued`);
    });
  }
}
