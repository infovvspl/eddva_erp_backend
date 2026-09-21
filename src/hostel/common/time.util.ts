import { BadRequestException } from '@nestjs/common';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Hostel roll call, meals and "today" are institute-local concepts, but the ERP
 * stores `@db.Date` columns as UTC-midnight values. HOSTEL_UTC_OFFSET_MINUTES
 * (e.g. 330 for IST, default 0) shifts where a local day begins/ends, so
 * "today" and the morning/night roll-call windows line up with the school day.
 */
function offsetMs(): number {
  const raw = Number(process.env.HOSTEL_UTC_OFFSET_MINUTES ?? 0);
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

/** Instants bounding a local calendar date (`date` is a UTC-midnight @db.Date value). */
export function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getTime() - offsetMs());
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Morning = first half of the local day, night = second half. */
export function sessionWindow(
  date: Date,
  session: 'morning' | 'night',
): { start: Date; end: Date } {
  const { start } = dayRange(date);
  const half = 12 * HOUR_MS;
  return session === 'morning'
    ? { start, end: new Date(start.getTime() + half) }
    : {
        start: new Date(start.getTime() + half),
        end: new Date(start.getTime() + DAY_MS),
      };
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
