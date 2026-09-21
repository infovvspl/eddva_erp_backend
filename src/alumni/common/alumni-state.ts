import {
  AlumniApplicationStatus,
  AlumniDonationStatus,
  AlumniMatchStatus,
  AlumniProgramStatus,
} from '@prisma/client';
import { BusinessException } from './business-exception';

/**
 * Allowed status moves per entity. Kept as data so the rules are visible in one
 * place and covered by unit tests; services call `assertTransition` and the
 * database update additionally guards on the previous status (compare-and-set)
 * so two racing requests cannot both apply the same transition.
 */
export const APPLICATION_TRANSITIONS: Record<
  AlumniApplicationStatus,
  readonly AlumniApplicationStatus[]
> = {
  applied: ['shortlisted', 'rejected', 'hired', 'withdrawn'],
  shortlisted: ['rejected', 'hired', 'withdrawn'],
  rejected: [],
  hired: [],
  withdrawn: [],
};

export const PROGRAM_TRANSITIONS: Record<
  AlumniProgramStatus,
  readonly AlumniProgramStatus[]
> = {
  open_for_signup: ['active', 'completed'],
  active: ['completed'],
  completed: [],
};

export const MATCH_TRANSITIONS: Record<
  AlumniMatchStatus,
  readonly AlumniMatchStatus[]
> = {
  active: ['completed', 'discontinued'],
  completed: [],
  discontinued: [],
};

export const DONATION_TRANSITIONS: Record<
  AlumniDonationStatus,
  readonly AlumniDonationStatus[]
> = {
  pending: ['received', 'failed', 'cancelled'],
  received: ['reversed'],
  failed: [],
  cancelled: [],
  reversed: [],
};

export function canTransition<T extends string>(
  map: Record<T, readonly T[]>,
  from: T,
  to: T,
): boolean {
  return map[from]?.includes(to) ?? false;
}

export function assertTransition<T extends string>(
  map: Record<T, readonly T[]>,
  from: T,
  to: T,
  label: string,
): void {
  if (!canTransition(map, from, to)) {
    throw new BusinessException(
      'INVALID_STATUS_TRANSITION',
      `${label} cannot move from "${from}" to "${to}"`,
      { from, to, allowed: map[from] ?? [] },
    );
  }
}

/** Seat-holding registrations: everything except a cancelled one. */
export const SEAT_HOLDING_STATUSES = [
  'registered',
  'attended',
  'no_show',
] as const;

/** Application states that still need the applicant's attention / can be withdrawn. */
export const OPEN_APPLICATION_STATUSES: readonly AlumniApplicationStatus[] = [
  'applied',
  'shortlisted',
];
