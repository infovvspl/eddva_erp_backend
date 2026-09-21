import { BadRequestException } from '@nestjs/common';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Campaign / mentorship dates are institute-local calendar days, but the ERP
 * stores `@db.Date` columns as UTC-midnight values. ALUMNI_UTC_OFFSET_MINUTES
 * (e.g. 330 for IST, default 0) shifts where a local day begins/ends, so
 * "today" lines up with the school's calendar day.
 */
function offsetMs(): number {
  const raw = Number(process.env.ALUMNI_UTC_OFFSET_MINUTES ?? 0);
  return Number.isFinite(raw) ? raw * 60 * 1000 : 0;
}

/** The institute-local calendar date of `now`, as a UTC-midnight Date (matches @db.Date columns). */
export function localToday(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + offsetMs());
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a `YYYY-MM-DD` string (including real calendar dates) and returns a UTC-midnight Date. */
export function parseDateOnly(value: string, name = 'date'): Date {
  if (!DATE_ONLY_REGEX.test(value)) {
    throw new BadRequestException(
      `${name} must be a date in YYYY-MM-DD format`,
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${name} is not a valid calendar date`);
  }
  return parsed;
}

/** Parses an ISO datetime and rejects garbage with a 400. */
export function parseDateTime(value: string, name = 'datetime'): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${name} must be a valid ISO datetime`);
  }
  return parsed;
}
