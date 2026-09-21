import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business-exception';

export type StateMap<S extends string> = Record<S, readonly S[]>;

/**
 * Gate pass workflow. `out`/`overdue` are only reachable through gate scanning
 * and the overdue sweep. `expired` = approved but never used before the
 * expected return time (the resident never left, so it is not an "overdue" alarm).
 */
export const GATE_PASS_TRANSITIONS: StateMap<
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'out'
  | 'returned'
  | 'overdue'
  | 'expired'
  | 'cancelled'
> = {
  pending: ['approved', 'rejected', 'cancelled', 'expired'],
  approved: ['out', 'cancelled', 'expired'],
  out: ['returned', 'overdue'],
  overdue: ['returned'],
  rejected: [],
  returned: [],
  expired: [],
  cancelled: [],
};

/** Complaint workflow. `closed` is terminal; a resolved complaint may be re-opened to in_progress. */
export const COMPLAINT_TRANSITIONS: StateMap<
  'open' | 'in_progress' | 'resolved' | 'closed'
> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

export function assertTransition<S extends string>(
  map: StateMap<S>,
  from: S,
  to: S,
  what: string,
): void {
  if (!map[from].includes(to)) {
    throw new BusinessException(
      'INVALID_STATE_TRANSITION',
      `${what} cannot move from "${from}" to "${to}"`,
      { from, to, allowed: map[from] },
      HttpStatus.CONFLICT,
    );
  }
}
