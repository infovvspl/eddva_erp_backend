import { HttpStatus } from '@nestjs/common';
import { AdmissionApplicationStatus, Prisma } from '@prisma/client';
import { BusinessException } from './business-exception';

type Status = AdmissionApplicationStatus;

/**
 * Transitions a staff member may trigger directly via POST /applications/:id/status.
 *
 * `offered` and `admitted` are deliberately absent as *targets*: they are only
 * reachable through the offer / confirmation workflows (seat + fee + acceptance
 * rules live there). They are also absent as *sources* — an offered/admitted
 * application is unwound through offer decline / confirmation cancel instead,
 * so the offer and confirmation records can never disagree with the status.
 *
 * `test_scheduled` is system-driven (test registration). Test and interview are
 * optional: nothing here forces an application through them.
 */
export const MANUAL_TRANSITIONS: Record<Status, Status[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'rejected', 'cancelled'],
  under_review: ['shortlisted', 'waitlisted', 'rejected', 'cancelled'],
  test_scheduled: [
    'under_review',
    'shortlisted',
    'waitlisted',
    'rejected',
    'cancelled',
  ],
  shortlisted: ['waitlisted', 'rejected', 'cancelled'],
  waitlisted: ['shortlisted', 'rejected', 'cancelled'],
  offered: [],
  admitted: [],
  rejected: [],
  cancelled: [],
};

/** Targets that count as an application "review" decision and need `applications:review`. */
export const REVIEW_TARGETS: Status[] = [
  'under_review',
  'shortlisted',
  'waitlisted',
  'rejected',
];

/** Statuses in which an application is still live in the pipeline (not terminal, not yet admitted). */
export const OPEN_STATUSES: Status[] = [
  'draft',
  'submitted',
  'under_review',
  'test_scheduled',
  'shortlisted',
  'waitlisted',
];

/** Statuses from which the assessment stages (test / interview) may be attached. */
export const ASSESSABLE_STATUSES: Status[] = [
  'submitted',
  'under_review',
  'test_scheduled',
  'shortlisted',
  'waitlisted',
];

/** Statuses in which an application may be placed on a merit list. */
export const MERIT_ELIGIBLE_STATUSES: Status[] = [
  'under_review',
  'test_scheduled',
  'shortlisted',
  'waitlisted',
];

/** Statuses from which an offer may be issued. */
export const OFFERABLE_STATUSES: Status[] = ['shortlisted', 'waitlisted'];

export function assertManualTransition(from: Status, to: Status): void {
  if (!MANUAL_TRANSITIONS[from].includes(to)) {
    const system = to === 'offered' || to === 'admitted';
    throw new BusinessException(
      'INVALID_STATUS_TRANSITION',
      system
        ? `Status "${to}" cannot be set directly; it is reached through the ${to === 'offered' ? 'offer' : 'confirmation'} workflow.`
        : `An application cannot move from "${from}" to "${to}".`,
      { from, to, allowed: MANUAL_TRANSITIONS[from] },
    );
  }
}

/**
 * Concurrency-safe status move: only succeeds while the row is still in one of
 * the expected `from` statuses, so two racing requests cannot both apply.
 * Returns false when nothing matched (someone else moved it first).
 */
export async function moveApplicationStatus(
  tx: Prisma.TransactionClient,
  applicationId: number,
  from: Status[],
  to: Status,
): Promise<boolean> {
  const result = await tx.admissionApplication.updateMany({
    where: { application_id: applicationId, status: { in: from } },
    data: { status: to },
  });
  return result.count > 0;
}

/** Same as moveApplicationStatus but a lost race is a 409 rather than a boolean. */
export async function moveApplicationStatusOrConflict(
  tx: Prisma.TransactionClient,
  applicationId: number,
  from: Status[],
  to: Status,
): Promise<void> {
  if (!(await moveApplicationStatus(tx, applicationId, from, to))) {
    throw new BusinessException(
      'APPLICATION_STATUS_CONFLICT',
      'Another user has already changed this application. Refresh and try again.',
      { expected_from: from, to },
      HttpStatus.CONFLICT,
    );
  }
}
