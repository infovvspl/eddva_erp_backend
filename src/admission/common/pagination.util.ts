import { BadRequestException } from '@nestjs/common';

export interface PaginationQuery {
  page?: number | string;
  limit?: number | string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

/** Normalizes page/limit query params into safe, bounded Prisma skip/take. */
export function parsePagination(query: PaginationQuery): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const rawLimit =
    parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export function buildMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Whitelisted sort field — unknown values fall back rather than reaching Prisma (which would 500). */
export function parseSort<T extends string>(
  sortBy: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(sortBy ?? '')
    ? (sortBy as T)
    : fallback;
}

export function parseSortOrder(sortOrder?: string): 'asc' | 'desc' {
  return sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';
}

/**
 * Parses an ISO date/datetime query param. A date-only `to` value is treated as
 * inclusive of that whole day. Invalid input is a 400, not a Prisma 500.
 */
export function parseDateParam(
  value: string | undefined,
  name: string,
  endOfDay = false,
): Date | undefined {
  if (!value) return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(
    dateOnly
      ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : value,
  );
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${name} must be a valid ISO date`);
  }
  return parsed;
}

/** Builds a Prisma `{gte, lte}` range from optional from/to query params. */
export function buildDateRange(
  from: string | undefined,
  to: string | undefined,
  fromName = 'from',
  toName = 'to',
): { gte?: Date; lte?: Date } | undefined {
  const gte = parseDateParam(from, fromName);
  const lte = parseDateParam(to, toName, true);
  if (gte && lte && gte > lte) {
    throw new BadRequestException(`${fromName} must not be after ${toName}`);
  }
  return gte || lte ? { gte, lte } : undefined;
}
