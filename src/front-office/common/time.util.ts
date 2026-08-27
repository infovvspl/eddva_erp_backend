import { BadRequestException } from '@nestjs/common';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Combines a "YYYY-MM-DD" date and "HH:mm" time-of-day into a single Date (UTC-based, no timezone shifting). */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  if (!TIME_PATTERN.test(timeStr)) {
    throw new BadRequestException(`Invalid time "${timeStr}" — expected HH:mm 24h format`);
  }
  const datePart = dateStr.length > 10 ? dateStr.slice(0, 10) : dateStr;
  const combined = new Date(`${datePart}T${timeStr}:00.000Z`);
  if (Number.isNaN(combined.getTime())) {
    throw new BadRequestException(`Invalid date "${dateStr}"`);
  }
  return combined;
}

export function toHHmm(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYYMMDD integer — used as the second key of pg_advisory_xact_lock(employeeId, dateKey). */
export function dateToLockKey(dateStr: string): number {
  return Number(dateStr.slice(0, 10).replace(/-/g, ''));
}
