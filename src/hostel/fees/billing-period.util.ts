import { HostelBillingCycle } from '@prisma/client';
import { BusinessException } from '../common/business-exception';
import { addDays, parseDateOnly } from '../common/time.util';

export interface BillingPeriod {
  start: Date;
  end: Date;
  label: string;
}

const MONTHS: Record<HostelBillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/**
 * A billing period always starts on the 1st of a month; quarterly periods on
 * the calendar quarter boundaries (Jan/Apr/Jul/Oct). The label is what shows up
 * on invoices and in "filter by billing period": `2026-09`, `2026-Q3`, `2026-27`.
 */
export function billingPeriodFor(
  cycle: HostelBillingCycle,
  startValue: string,
): BillingPeriod {
  const start = parseDateOnly(startValue, 'billing_period_start');
  const year = start.getUTCFullYear();
  const month0 = start.getUTCMonth();

  if (start.getUTCDate() !== 1) {
    throw new BusinessException(
      'INVALID_BILLING_PERIOD',
      'billing_period_start must be the first day of a month',
    );
  }
  if (cycle === 'quarterly' && month0 % 3 !== 0) {
    throw new BusinessException(
      'INVALID_BILLING_PERIOD',
      'A quarterly period must start on 1 January, 1 April, 1 July or 1 October',
    );
  }

  const end = new Date(Date.UTC(year, month0 + MONTHS[cycle], 0)); // last day of the final month
  const mm = String(month0 + 1).padStart(2, '0');
  const label =
    cycle === 'monthly'
      ? `${year}-${mm}`
      : cycle === 'quarterly'
        ? `${year}-Q${month0 / 3 + 1}`
        : `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  return { start, end, label };
}

export const DEFAULT_DUE_DAYS = 10;

export function defaultDueDate(periodStart: Date): Date {
  return addDays(periodStart, DEFAULT_DUE_DAYS);
}
