import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobsService } from '../jobs/jobs.service';
import { EventsService } from '../events/events.service';
import { CampaignsService } from '../fundraising/campaigns.service';
import { ProgramsService } from '../mentorship/programs.service';

/**
 * Background processing on the app's existing @nestjs/schedule setup (the same
 * mechanism as the Library, Admission and Hostel schedulers) — no new scheduler
 * or queue was introduced.
 *
 * Every sweep is idempotent and none is required for correctness: applying to a
 * job checks its expiry date itself, event registration checks the event and
 * deadline dates, donations check the campaign window, and listings compute the
 * effective status. The sweeps persist the status change and queue the
 * notification exactly once (each UPDATE … RETURNING claims a row once).
 *
 * A job still running when its next tick fires is skipped rather than stacked
 * (single-instance guard; use a DB advisory lock if the app is ever run as
 * several replicas — the row-claiming SQL is already safe against that).
 *
 * Newsletter delivery is NOT scheduled here: sending queues communication logs
 * synchronously (inserts only), and there is no e-mail/SMS provider to drain
 * them — see NewslettersService.send.
 */
@Injectable()
export class AlumniScheduler {
  private readonly logger = new Logger(AlumniScheduler.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly jobs: JobsService,
    private readonly events: EventsService,
    private readonly campaigns: CampaignsService,
    private readonly programs: ProgramsService,
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

  /** Open postings past their expiry date become `expired`; the poster is told once. */
  @Cron(CronExpression.EVERY_HOUR)
  jobExpirySweep() {
    return this.guarded('job-expiry-sweep', async () => {
      const expired = await this.jobs.expireJobs();
      if (expired > 0)
        this.logger.log(`Job expiry sweep: ${expired} posting(s) expired`);
    });
  }

  /** upcoming → ongoing → completed. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  eventStatusSweep() {
    return this.guarded('event-status-sweep', async () => {
      const { ongoing, completed } = await this.events.advanceStatuses();
      if (ongoing > 0 || completed > 0) {
        this.logger.log(
          `Event status sweep: ${ongoing} started, ${completed} completed`,
        );
      }
    });
  }

  /** One reminder per registration for events starting within 24 hours. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  eventReminderSweep() {
    return this.guarded('event-reminder-sweep', async () => {
      const queued = await this.events.queueReminders();
      if (queued > 0) this.logger.log(`Event reminders: ${queued} queued`);
    });
  }

  /** Active campaigns past their end date become `completed`. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  campaignSweep() {
    return this.guarded('campaign-sweep', async () => {
      const done = await this.campaigns.completeEndedCampaigns();
      if (done > 0)
        this.logger.log(`Campaign sweep: ${done} campaign(s) completed`);
    });
  }

  /** Mentorship programs past their end date are completed (freeing the mentors). */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  programSweep() {
    return this.guarded('program-sweep', async () => {
      const done = await this.programs.completeEndedPrograms();
      if (done > 0)
        this.logger.log(`Program sweep: ${done} program(s) completed`);
    });
  }
}
