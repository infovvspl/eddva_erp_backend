/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '@prisma/client';
import { TestsService } from './tests.service';

const actor = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Officer',
  is_institute_admin: false,
};

describe('TestsService', () => {
  const db = {
    admissionApplication: { findMany: jest.fn(), updateMany: jest.fn() },
    admissionTestRegistration: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    admissionTestResult: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const lookup = { test: jest.fn(), session: jest.fn(), program: jest.fn() };
  const numbering = { next: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { queueMany: jest.fn() };
  const service = new TestsService(
    db as never,
    lookup as never,
    numbering as never,
    audit as never,
    notifications as never,
  );

  const test = {
    test_id: 1,
    name: 'G5 Entrance',
    program_id: 5,
    session_id: 2,
    max_marks: new Prisma.Decimal(100),
  };
  const app = (id: number, over: Record<string, unknown> = {}) => ({
    application_id: id,
    program_id: 5,
    session_id: 2,
    status: 'under_review',
    applicant: { name: 'X', email: 'x@y.z', phone: '9' },
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.test.mockResolvedValue(test);
    db.admissionTestRegistration.findMany.mockResolvedValue([]);
    db.admissionApplication.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('register', () => {
    it('issues a unique hall ticket per application and moves fresh applications to test_scheduled', async () => {
      db.admissionApplication.findMany.mockResolvedValue([
        app(1),
        app(2, { status: 'shortlisted' }),
      ]);
      numbering.next
        .mockResolvedValueOnce('HT/2027-28/00001')
        .mockResolvedValueOnce('HT/2027-28/00002');
      db.admissionTestRegistration.create.mockImplementation(
        ({ data }: { data: object }) =>
          Promise.resolve({
            registration_id: 1,
            status: 'registered',
            ...data,
          }),
      );
      const result = await service.register(actor, 1, {
        application_ids: [1, 2],
      });

      expect(result.map((r) => r.hall_ticket_number)).toEqual([
        'HT/2027-28/00001',
        'HT/2027-28/00002',
      ]);
      // only the submitted/under_review one is moved; a shortlisted one keeps its status
      expect(db.admissionApplication.updateMany).toHaveBeenCalledWith({
        where: {
          application_id: { in: [1] },
          status: { in: ['submitted', 'under_review'] },
        },
        data: { status: 'test_scheduled' },
      });
      expect(notifications.queueMany).toHaveBeenCalled();
    });

    it('duplicate registration is rejected (409) and nothing is registered', async () => {
      db.admissionApplication.findMany.mockResolvedValue([app(1)]);
      db.admissionTestRegistration.findMany.mockResolvedValue([
        { application_id: 1 },
      ]);
      await expect(
        service.register(actor, 1, { application_ids: [1] }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          error: 'REGISTRATION_REJECTED',
          details: {
            problems: [{ application_id: 1, reason: 'ALREADY_REGISTERED' }],
          },
        },
      });
      expect(db.admissionTestRegistration.create).not.toHaveBeenCalled();
    });

    it('one bad application rejects the entire batch (all-or-nothing)', async () => {
      db.admissionApplication.findMany.mockResolvedValue([
        app(1),
        app(2, { program_id: 9 }),
      ]);
      await expect(
        service.register(actor, 1, { application_ids: [1, 2, 3] }),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          details: {
            problems: [
              { application_id: 2, reason: 'PROGRAM_OR_SESSION_MISMATCH' },
              { application_id: 3, reason: 'NOT_FOUND' },
            ],
          },
        },
      });
      expect(db.admissionTestRegistration.create).not.toHaveBeenCalled();
      expect(numbering.next).not.toHaveBeenCalled(); // no hall tickets burned
    });

    it.each(['draft', 'rejected', 'cancelled', 'offered', 'admitted'])(
      'an application in %s status is not eligible',
      async (status) => {
        db.admissionApplication.findMany.mockResolvedValue([
          app(1, { status }),
        ]);
        await expect(
          service.register(actor, 1, { application_ids: [1] }),
        ).rejects.toMatchObject({
          response: { error: 'REGISTRATION_REJECTED' },
        });
      },
    );
  });

  describe('recordResults', () => {
    const registration = (id: number, status = 'registered') => ({
      application_id: id,
      test_id: 1,
      status,
    });

    it('rejects marks above the maximum, unregistered and absent applicants — recording nothing', async () => {
      db.admissionTestRegistration.findMany.mockResolvedValue([
        registration(1),
        registration(2, 'absent'),
      ]);
      await expect(
        service.recordResults(actor, 1, {
          results: [
            { application_id: 1, marks_obtained: 101 },
            { application_id: 2, marks_obtained: 50 },
            { application_id: 3, marks_obtained: 50 },
          ],
        }),
      ).rejects.toMatchObject({
        response: {
          error: 'RESULTS_REJECTED',
          details: {
            problems: [
              { application_id: 1, reason: 'MARKS_EXCEED_MAX_100' },
              { application_id: 2, reason: 'MARKED_ABSENT' },
              { application_id: 3, reason: 'NOT_REGISTERED' },
            ],
          },
        },
      });
      expect(db.admissionTestResult.create).not.toHaveBeenCalled();
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('records marks, marks the applicant appeared and recomputes ranks for the whole test', async () => {
      db.admissionTestRegistration.findMany.mockResolvedValue([
        registration(1),
      ]);
      db.admissionTestResult.findUnique.mockResolvedValue(null);
      db.admissionTestRegistration.updateMany.mockResolvedValue({ count: 1 });
      db.admissionTestResult.findMany.mockResolvedValue([]);
      await service.recordResults(actor, 1, {
        results: [{ application_id: 1, marks_obtained: 82.5 }],
      });

      expect(db.admissionTestResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          application_id: 1,
          test_id: 1,
          recorded_by: 'u1',
        }),
      });
      expect(db.admissionTestRegistration.updateMany).toHaveBeenCalledWith({
        where: { test_id: 1, application_id: 1, status: 'registered' },
        data: { status: 'appeared' },
      });
      expect(db.$executeRaw).toHaveBeenCalledTimes(1); // RANK() recompute, in the same transaction
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'record',
          metadata: expect.objectContaining({
            marks_obtained: '82.5',
            previous_marks: null,
          }),
        }),
      );
    });

    it('a correction is audited with the previous marks', async () => {
      db.admissionTestRegistration.findMany.mockResolvedValue([
        registration(1, 'appeared'),
      ]);
      db.admissionTestResult.findUnique.mockResolvedValue({
        result_id: 7,
        marks_obtained: new Prisma.Decimal(40),
      });
      db.admissionTestResult.findMany.mockResolvedValue([]);
      await service.recordResults(actor, 1, {
        results: [{ application_id: 1, marks_obtained: 45 }],
      });
      expect(db.admissionTestResult.update).toHaveBeenCalledWith({
        where: { result_id: 7 },
        data: expect.objectContaining({ recorded_by: 'u1' }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'correct',
          metadata: expect.objectContaining({ previous_marks: '40' }),
        }),
      );
    });

    it('the same application twice in one request is refused', async () => {
      await expect(
        service.recordResults(actor, 1, {
          results: [
            { application_id: 1, marks_obtained: 1 },
            { application_id: 1, marks_obtained: 2 },
          ],
        }),
      ).rejects.toMatchObject({ response: { error: 'DUPLICATE_ENTRIES' } });
    });
  });

  describe('test definition', () => {
    it('an offline test must name a venue', async () => {
      lookup.session.mockResolvedValue({});
      lookup.program.mockResolvedValue({});
      await expect(
        service.create(actor, {
          name: 'T',
          session_id: 2,
          program_id: 5,
          test_date: new Date().toISOString(),
          mode: 'offline',
          max_marks: 100,
        }),
      ).rejects.toMatchObject({ response: { error: 'VENUE_REQUIRED' } });
    });

    it('max_marks cannot drop below marks already recorded', async () => {
      db.admissionTestResult.count.mockResolvedValue(2);
      await expect(
        service.update(actor, 1, { max_marks: 50 }),
      ).rejects.toMatchObject({
        response: { error: 'MAX_MARKS_BELOW_RESULTS' },
      });
    });
  });
});
