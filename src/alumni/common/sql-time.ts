import { Prisma } from '@prisma/client';

/**
 * Prisma stores `DateTime` columns as `timestamp` WITHOUT time zone, holding
 * UTC wall-clock values. In raw SQL, though, `now()` and JS `Date` parameters are
 * `timestamptz`; comparing them to those columns makes Postgres reinterpret the
 * column in the SESSION time zone, so on any server that is not on UTC every
 * comparison is off by the zone offset (5h30 on an IST database — events would
 * start and jobs would expire hours early). These fragments convert to the same
 * naive-UTC representation Prisma writes, so raw SQL agrees with the ORM.
 */
export const sqlNowUtc = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

/** A JS Date as a naive-UTC timestamp comparable with Prisma `DateTime` columns. */
export const sqlUtc = (date: Date) =>
  Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;
