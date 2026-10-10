import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LmsSyncService } from './lms-sync.service';

/** Re-pushes confirmed admissions whose LMS student is still pending (LMS down, class not mapped yet, ...). */
@Injectable()
export class LmsSyncScheduler {
  private readonly logger = new Logger(LmsSyncScheduler.name);
  private running = false;

  constructor(private readonly lms: LmsSyncService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.lms.retryPending();
      if (n > 0) this.logger.log(`LMS retry sweep: ${n} confirmation(s) attempted`);
    } catch (err) {
      this.logger.error('LMS retry sweep failed', err as Error);
    } finally {
      this.running = false;
    }
  }
}
