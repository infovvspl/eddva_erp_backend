/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InterviewsService } from './interviews.service';

const user = (id: string) => ({
  eddva_user_id: id,
  institute_id: 'inst-1',
  user_name: `User ${id}`,
  user_role: 'Evaluator',
  is_institute_admin: false,
});

describe('InterviewsService', () => {
  const db = {
    admissionInterview: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    admissionInterviewEvaluation: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    lockApplication: jest.fn(),
    staffMember: jest.fn(),
    interview: jest.fn(),
  };
  const access = { hasPermission: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { queue: jest.fn() };
  const service = new InterviewsService(
    db as never,
    lookup as never,
    access as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof db) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[]),
    );
  });

  describe('evaluate — only authorised evaluators', () => {
    const interview = (over: Record<string, unknown> = {}) => ({
      interview_id: 4,
      application_id: 9,
      status: 'scheduled',
      panelists: [{ evaluator_id: 'e1' }],
      ...over,
    });
    const dto = {
      score: 88,
      remarks: 'Strong',
      recommendation: 'recommend' as const,
    };

    it('a user who is not on the assigned panel is refused', async () => {
      db.admissionInterview.findFirst.mockResolvedValue(interview());
      await expect(service.evaluate(user('e2'), 4, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.admissionInterviewEvaluation.create).not.toHaveBeenCalled();
    });

    it('a panelist can evaluate; the interview becomes completed and the score is audited with the evaluator', async () => {
      db.admissionInterview.findFirst.mockResolvedValue(interview());
      db.admissionInterviewEvaluation.create.mockResolvedValue({
        evaluation_id: 1,
        score: new Prisma.Decimal(88),
        recommendation: 'recommend',
      });
      db.admissionInterview.updateMany.mockResolvedValue({ count: 1 });
      await service.evaluate(user('e1'), 4, dto);

      expect(db.admissionInterviewEvaluation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          interview_id: 4,
          evaluator_id: 'e1',
          evaluator_name: 'User e1',
        }),
      });
      expect(db.admissionInterview.updateMany).toHaveBeenCalledWith({
        where: {
          interview_id: 4,
          status: { in: ['scheduled', 'rescheduled'] },
        },
        data: { status: 'completed' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        user('e1'),
        expect.objectContaining({
          action: 'evaluate',
          metadata: expect.objectContaining({
            application_id: 9,
            score: '88',
            recommendation: 'recommend',
          }),
        }),
      );
    });

    it('with no panel assigned, any holder of interviews:evaluate may evaluate (route guard already checked)', async () => {
      db.admissionInterview.findFirst.mockResolvedValue(
        interview({ panelists: [] }),
      );
      db.admissionInterviewEvaluation.create.mockResolvedValue({
        evaluation_id: 2,
        score: new Prisma.Decimal(70),
        recommendation: 'waitlist',
      });
      db.admissionInterview.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        service.evaluate(user('anyone'), 4, {
          ...dto,
          recommendation: 'waitlist',
        }),
      ).resolves.toBeDefined();
    });

    it('a no-show interview cannot be evaluated', async () => {
      db.admissionInterview.findFirst.mockResolvedValue(
        interview({ status: 'no_show' }),
      );
      await expect(service.evaluate(user('e1'), 4, dto)).rejects.toMatchObject({
        response: { error: 'INTERVIEW_NO_SHOW' },
      });
    });

    it('one evaluation per evaluator: the unique violation becomes a clean 409', async () => {
      db.admissionInterview.findFirst.mockResolvedValue(interview());
      db.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6',
        }),
      );
      await expect(service.evaluate(user('e1'), 4, dto)).rejects.toMatchObject({
        status: 409,
        response: { error: 'EVALUATION_ALREADY_SUBMITTED' },
      });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('unknown / other-institute interview → 404', async () => {
      db.admissionInterview.findFirst.mockResolvedValue(null);
      await expect(service.evaluate(user('e1'), 4, dto)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('read scope — evaluators only see their own assignments', () => {
    beforeEach(() => {
      db.admissionInterview.findMany.mockResolvedValue([]);
      db.admissionInterview.count.mockResolvedValue(0);
    });

    it('neither read nor read_assigned → 403', async () => {
      access.hasPermission.mockResolvedValue(false);
      await expect(service.findAll(user('e1'), {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('read_assigned only → query is restricted to interviews where the user is a panelist', async () => {
      access.hasPermission.mockImplementation(
        (_a: unknown, _r: string, action: string) =>
          Promise.resolve(action === 'read_assigned'),
      );
      await service.findAll(user('e1'), {});
      expect(db.admissionInterview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            panelists: { some: { evaluator_id: 'e1' } },
          }),
        }),
      );
    });

    it('read (all) → no panel restriction', async () => {
      access.hasPermission.mockResolvedValue(true);
      await service.findAll(user('officer'), {});
      const [args] = db.admissionInterview.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      const where = args.where;
      expect(where.panelists).toBeUndefined();
    });

    it('an assigned-only evaluator sees only their own evaluation, not other panelists’ scores', async () => {
      access.hasPermission.mockImplementation(
        (_a: unknown, _r: string, action: string) =>
          Promise.resolve(action === 'read_assigned'),
      );
      db.admissionInterview.findFirst.mockResolvedValue({
        interview_id: 4,
        panelists: [{ evaluator_id: 'e1' }, { evaluator_id: 'e2' }],
        evaluations: [
          { evaluator_id: 'e1', score: 80 },
          { evaluator_id: 'e2', score: 60 },
        ],
      });
      const result = await service.findOne(user('e1'), 4);
      expect(result.evaluations).toEqual([{ evaluator_id: 'e1', score: 80 }]);
    });

    it('cannot open an interview they are not assigned to', async () => {
      access.hasPermission.mockImplementation(
        (_a: unknown, _r: string, action: string) =>
          Promise.resolve(action === 'read_assigned'),
      );
      db.admissionInterview.findFirst.mockResolvedValue({
        interview_id: 4,
        panelists: [{ evaluator_id: 'e2' }],
        evaluations: [],
      });
      await expect(service.findOne(user('e1'), 4)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('schedule — interview is optional and one-per-application', () => {
    const dto = {
      application_id: 9,
      scheduled_datetime: new Date(Date.now() + 86400000).toISOString(),
      mode: 'online' as const,
      venue_or_link: 'https://meet',
    };

    it('cannot be in the past', async () => {
      await expect(
        service.schedule(user('o'), {
          ...dto,
          scheduled_datetime: new Date(Date.now() - 1000).toISOString(),
        }),
      ).rejects.toMatchObject({ response: { error: 'INTERVIEW_IN_PAST' } });
    });

    it('draft/terminal applications are not eligible', async () => {
      lookup.lockApplication.mockResolvedValue({
        application_id: 9,
        status: 'draft',
      });
      await expect(service.schedule(user('o'), dto)).rejects.toMatchObject({
        response: { error: 'APPLICATION_NOT_ELIGIBLE' },
      });
    });

    it('a second interview for the same application is a 409 (reschedule instead)', async () => {
      lookup.lockApplication.mockResolvedValue({
        application_id: 9,
        status: 'under_review',
      });
      db.admissionInterview.findUnique.mockResolvedValue({ interview_id: 1 });
      await expect(service.schedule(user('o'), dto)).rejects.toMatchObject({
        status: 409,
        response: { error: 'INTERVIEW_ALREADY_SCHEDULED' },
      });
    });

    it('panelists must be real, active admission staff', async () => {
      lookup.staffMember.mockRejectedValue(
        Object.assign(new Error('no such staff'), { status: 404 }),
      );
      await expect(
        service.schedule(user('o'), { ...dto, panelist_ids: ['ghost'] }),
      ).rejects.toMatchObject({ status: 404 });
      expect(db.admissionInterview.create).not.toHaveBeenCalled();
    });
  });
});
