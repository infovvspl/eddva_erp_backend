import { AlumniCommChannel, Prisma } from '@prisma/client';
import { BusinessException } from '../common/business-exception';
import { NewsletterSegmentDto } from './dto/newsletter.dto';

/** The persisted, normalised form of a segment: only known keys, no empty lists. */
export interface NormalizedSegment {
  all?: true;
  batch_years?: number[];
  graduation_years?: number[];
  programs?: string[];
  cities?: string[];
  countries?: string[];
  industries?: string[];
  companies?: string[];
  group_ids?: number[];
}

const NUMBER_KEYS = ['batch_years', 'graduation_years', 'group_ids'] as const;
const TEXT_KEYS = [
  'programs',
  'cities',
  'countries',
  'industries',
  'companies',
] as const;

/**
 * Validates a segment and reduces it to the whitelisted, de-duplicated form that
 * is stored. It is deliberately NOT an expression language: clients can only
 * pick from these fields, so nothing they send is ever interpreted as a query.
 * An audience must be chosen explicitly — `all: true` or at least one filter —
 * so an empty segment can never turn into "everyone".
 */
export function normalizeSegment(
  input: Partial<NewsletterSegmentDto> | null | undefined,
): NormalizedSegment {
  const out: NormalizedSegment = {};
  const seg = input ?? {};

  for (const key of NUMBER_KEYS) {
    const values = seg[key];
    if (Array.isArray(values) && values.length > 0) {
      out[key] = [...new Set(values.map(Number))];
    }
  }
  for (const key of TEXT_KEYS) {
    const values = seg[key];
    if (Array.isArray(values)) {
      const cleaned = [
        ...new Set(values.map((v) => String(v).trim()).filter(Boolean)),
      ];
      if (cleaned.length > 0) out[key] = cleaned;
    }
  }

  const hasFilters = Object.keys(out).length > 0;
  if (seg.all === true) {
    if (hasFilters) {
      throw new BusinessException(
        'INVALID_SEGMENT',
        'A segment with all=true cannot also carry filters',
      );
    }
    return { all: true };
  }
  if (!hasFilters) {
    throw new BusinessException(
      'INVALID_SEGMENT',
      'Choose an audience: set all=true, or at least one filter (batch_years, programs, cities, …)',
    );
  }
  return out;
}

/**
 * Turns a stored segment into a database filter, evaluated against CURRENT
 * alumni data. Only verified, active alumni are ever addressed, and only those
 * who opted in to the channel (and, for SMS, have a phone number).
 */
export function buildSegmentWhere(
  instituteId: string,
  segment: NormalizedSegment,
  channel: AlumniCommChannel,
): Prisma.AlumniProfileWhereInput {
  const and: Prisma.AlumniProfileWhereInput[] = [];
  const ci = (
    values: string[],
    column: 'program' | 'city' | 'country' | 'industry' | 'current_company',
  ) => ({
    OR: values.map((v) => ({
      [column]: { equals: v, mode: 'insensitive' as const },
    })) as Prisma.AlumniProfileWhereInput[],
  });

  if (segment.batch_years)
    and.push({ batch_year: { in: segment.batch_years } });
  if (segment.graduation_years) {
    and.push({ graduation_year: { in: segment.graduation_years } });
  }
  if (segment.programs) and.push(ci(segment.programs, 'program'));
  if (segment.cities) and.push(ci(segment.cities, 'city'));
  if (segment.countries) and.push(ci(segment.countries, 'country'));
  if (segment.industries) and.push(ci(segment.industries, 'industry'));
  if (segment.companies) and.push(ci(segment.companies, 'current_company'));
  if (segment.group_ids) {
    and.push({
      group_memberships: {
        some: {
          group_id: { in: segment.group_ids },
          group: { is_active: true },
        },
      },
    });
  }

  return {
    institute_id: instituteId,
    is_active: true,
    verification_status: 'verified',
    ...(channel === 'email'
      ? { email_opt_in: true }
      : { sms_opt_in: true, phone: { not: null } }),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}
