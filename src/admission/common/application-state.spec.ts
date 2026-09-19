import { AdmissionApplicationStatus } from '@prisma/client';
import {
  MANUAL_TRANSITIONS,
  assertManualTransition,
  moveApplicationStatus,
  moveApplicationStatusOrConflict,
} from './application-state';

const ALL = Object.keys(MANUAL_TRANSITIONS) as AdmissionApplicationStatus[];

describe('application state machine', () => {
  it('allows the normal forward path', () => {
    expect(() => assertManualTransition('draft', 'submitted')).not.toThrow();
    expect(() =>
      assertManualTransition('submitted', 'under_review'),
    ).not.toThrow();
    expect(() =>
      assertManualTransition('under_review', 'shortlisted'),
    ).not.toThrow();
    expect(() =>
      assertManualTransition('waitlisted', 'shortlisted'),
    ).not.toThrow();
  });

  it('never lets Draft jump to Admitted (or skip the pipeline)', () => {
    let caught: unknown;
    try {
      assertManualTransition('draft', 'admitted');
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({
      response: { error: 'INVALID_STATUS_TRANSITION' },
    });
    expect(() => assertManualTransition('submitted', 'shortlisted')).toThrow();
  });

  it.each(ALL)(
    'offered/admitted are workflow-only targets: %s → offered|admitted is refused',
    (from) => {
      expect(() => assertManualTransition(from, 'offered')).toThrow();
      expect(() => assertManualTransition(from, 'admitted')).toThrow();
    },
  );

  it('offered and admitted applications have no manual exit (offer/confirmation records must stay consistent)', () => {
    expect(MANUAL_TRANSITIONS.offered).toEqual([]);
    expect(MANUAL_TRANSITIONS.admitted).toEqual([]);
  });

  it('rejected and cancelled are terminal', () => {
    expect(MANUAL_TRANSITIONS.rejected).toEqual([]);
    expect(MANUAL_TRANSITIONS.cancelled).toEqual([]);
  });

  it('test_scheduled is system-driven only (test/interview stay optional)', () => {
    for (const from of ALL) {
      expect(MANUAL_TRANSITIONS[from]).not.toContain('test_scheduled');
    }
    // and nothing forces an application through it: shortlisting is reachable from under_review
    expect(MANUAL_TRANSITIONS.under_review).toContain('shortlisted');
  });

  describe('moveApplicationStatus', () => {
    const tx = (count: number) =>
      ({
        admissionApplication: {
          updateMany: jest.fn().mockResolvedValue({ count }),
        },
      }) as never;

    it('is guarded by the expected current status', async () => {
      const t = tx(1) as unknown as {
        admissionApplication: { updateMany: jest.Mock };
      };
      await expect(
        moveApplicationStatus(t as never, 7, ['shortlisted'], 'offered'),
      ).resolves.toBe(true);
      expect(t.admissionApplication.updateMany).toHaveBeenCalledWith({
        where: { application_id: 7, status: { in: ['shortlisted'] } },
        data: { status: 'offered' },
      });
    });

    it('reports a lost race as false / a 409', async () => {
      await expect(
        moveApplicationStatus(tx(0), 7, ['shortlisted'], 'offered'),
      ).resolves.toBe(false);
      await expect(
        moveApplicationStatusOrConflict(tx(0), 7, ['shortlisted'], 'offered'),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: 'APPLICATION_STATUS_CONFLICT' },
      });
    });
  });
});
