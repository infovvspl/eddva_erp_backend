import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlumniLmsSyncService } from './alumni-lms-sync.service';

/** Re-pushes alumni profiles whose LMS GRADUATED status push is still pending (LMS down, no student_ref yet, ...). */
@Injectable()
export class AlumniLmsSyncScheduler {
  private readonly logger = new Logger(AlumniLmsSyncScheduler.name);
  private running = false;

  constructor(private readonly lms: AlumniLmsSyncService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.lms.retryPending();
      if (n > 0) this.logger.log(`Alumni LMS retry sweep: ${n} profile(s) attempted`);
    } catch (err) {
      this.logger.error('Alumni LMS retry sweep failed', err as Error);
    } finally {
      this.running = false;
    }
  }
}
