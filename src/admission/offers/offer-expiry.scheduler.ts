import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OffersService } from './offers.service';

/**
 * Hourly sweep, on the app's existing @nestjs/schedule setup (same mechanism
 * as the Library scheduler). Expiry is also enforced synchronously at accept
 * time, so this job only keeps stored state, seats and notifications tidy —
 * correctness never depends on it having run. Both operations are idempotent.
 */
@Injectable()
export class OfferExpiryScheduler {
  private readonly logger = new Logger(OfferExpiryScheduler.name);

  constructor(private readonly offers: OffersService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    try {
      const expired = await this.offers.expireOverdueOffers();
      const reminded = await this.offers.queueExpiryReminders();
      if (expired > 0 || reminded > 0) {
        this.logger.log(
          `Offer sweep: ${expired} expired, ${reminded} reminder(s) queued`,
        );
      }
    } catch (err) {
      this.logger.error('Offer expiry sweep failed', err as Error);
    }
  }
}
