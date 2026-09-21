/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { ForbiddenException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ApplicationsService } from './applications.service';
import { BusinessException } from '../common/business-exception';

const HOUR = 3600 * 1000;
const staff = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Olivia',
  user_role: 'Officer',
  is_institute_admin: false,
};
const alumnus = (id = 7, verified = true) => ({
  ...staff,
  eddva_user_id: `alumni-${id}`,
  user_role: 'ALUMNI',
  alumni_id: id,
  alumni_verified: verified,
});
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (e) {
    const res = (e as BusinessException).getResponse?.() as { error?: string };
    return res?.error ?? (e as Error).constructor.name;
  }
};
const job = (over: Record<string, unknown> = {}) => ({
  job_id: 1,
  institute_id: 'inst-1',
  title: 'Engineer',
  company: 'Acme',
  status: 'open',
  expiry_date: new Date(Date.now() + 24 * HOUR),
  posted_by_alumni_id: 3,
  ...over,
});

describe('JobsService', () => {
  const db: Record<string, any> = {
    alumniJob: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    alumniJobApplication: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { job: jest.fn(), profile: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyAlumni: jest.fn(), notifyStaff: jest.fn() };
  const svc = new JobsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );
  const body = {
    title: 'T',
    company: 'C',
    description: 'D',
    job_type: 'full_time',
  } as never;

  beforeEach(() => {
    jest.resetAllMocks();
    db.alumniJob.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ job_id: 1, status: 'open', ...data }),
    );
    db.alumniJob.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ job_id: 1, status: 'open', ...data }),
    );
    db.$transaction.mockImplementation((ops: unknown) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    db.alumniJob.findMany.mockResolvedValue([]);
    db.alumniJob.count.mockResolvedValue(0);
  });

  describe('posting', () => {
    it('an unverified alumnus cannot post (verification gates job posting)', async () => {
      await expect(
        svc.create(alumnus(7, false) as never, body),
      ).rejects.toThrow(ForbiddenException);
      expect(db.alumniJob.create).not.toHaveBeenCalled();
    });

    it('a verified alumnus posts as themselves and cannot post as someone else', async () => {
      const posted = await svc.create(alumnus(7), body);
      expect(posted).toMatchObject({ posted_by_alumni_id: 7 });
      await expect(
        svc.create(
          alumnus(7) as never,
          { ...(body as object), posted_by_alumni_id: 8 } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('staff can post for a partner company (no alumnus poster) or on behalf of an alumnus', async () => {
      expect(await svc.create(staff as never, body)).toMatchObject({
        posted_by_alumni_id: null,
      });
      lookup.profile.mockResolvedValue({ alumni_id: 9, is_active: true });
      expect(
        await svc.create(
          staff as never,
          { ...(body as object), posted_by_alumni_id: 9 } as never,
        ),
      ).toMatchObject({ posted_by_alumni_id: 9 });
    });

    it('an expiry date in the past is rejected', async () => {
      expect(
        await code(
          svc.create(
            staff as never,
            {
              ...(body as object),
              expiry_date: new Date(Date.now() - HOUR).toISOString(),
            } as never,
          ),
        ),
      ).toBe('INVALID_EXPIRY');
    });
  });

  describe('managing', () => {
    it('alumni can only edit / close / delete their own postings; staff any', async () => {
      lookup.job.mockResolvedValue(job({ posted_by_alumni_id: 3 }));
      await expect(
        svc.update(alumnus(7) as never, 1, { title: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(svc.close(alumnus(7) as never, 1)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(svc.remove(alumnus(7) as never, 1)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        svc.update(alumnus(3) as never, 1, { title: 'x' }),
      ).resolves.toBeDefined();
      await expect(
        svc.update(staff as never, 1, { title: 'x' }),
      ).resolves.toBeDefined();
    });

    it('a closed posting cannot be edited', async () => {
      lookup.job.mockResolvedValue(job({ status: 'closed' }));
      expect(await code(svc.update(staff as never, 1, { title: 'x' }))).toBe(
        'JOB_CLOSED',
      );
    });

    it('a new future expiry re-opens an expired posting', async () => {
      lookup.job.mockResolvedValue(job({ status: 'expired' }));
      await svc.update(staff, 1, {
        expiry_date: new Date(Date.now() + 48 * HOUR).toISOString(),
      });
      expect(db.alumniJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'open' }),
        }),
      );
    });

    it('closing twice is a 409', async () => {
      lookup.job.mockResolvedValue(job());
      db.alumniJob.updateMany.mockResolvedValue({ count: 0 });
      expect(await code(svc.close(staff as never, 1))).toBe(
        'JOB_ALREADY_CLOSED',
      );
    });

    it('a posting with applications is closed, never deleted', async () => {
      lookup.job.mockResolvedValue(job());
      db.alumniJobApplication.count.mockResolvedValue(2);
      expect(await code(svc.remove(staff as never, 1))).toBe(
        'JOB_HAS_APPLICATIONS',
      );
      expect(db.alumniJob.delete).not.toHaveBeenCalled();
    });
  });

  describe('listing', () => {
    it('alumni see open, unexpired postings plus their own; staff see everything', async () => {
      await svc.findAll(alumnus(7), {});
      const alumniWhere = JSON.stringify(
        db.alumniJob.findMany.mock.calls[0][0].where,
      );
      expect(alumniWhere).toContain('"posted_by_alumni_id":7');
      expect(alumniWhere).toContain('"status":"open"');
      await svc.findAll(staff, {});
      const staffWhere = JSON.stringify(
        db.alumniJob.findMany.mock.calls[1][0].where,
      );
      expect(staffWhere).not.toContain('"status":"open"');
    });

    it('status=open excludes postings past their expiry even if the sweep has not run', async () => {
      await svc.findAll(staff, { status: 'open' });
      const where = db.alumniJob.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain('expiry_date');
    });

    it('a closed posting of someone else is a 404 for alumni', async () => {
      lookup.job.mockResolvedValue(
        job({ status: 'closed', posted_by_alumni_id: 3 }),
      );
      await expect(svc.findOne(alumnus(7) as never, 1)).rejects.toThrow(
        /not found/,
      );
      await expect(svc.findOne(alumnus(3) as never, 1)).resolves.toBeDefined();
    });

    it('other alumni do not see application counts', async () => {
      db.alumniJob.findMany.mockResolvedValue([
        { ...job({ posted_by_alumni_id: 3 }), _count: { applications: 4 } },
      ]);
      db.alumniJob.count.mockResolvedValue(1);
      const other = await svc.findAll(alumnus(7), {});
      expect(other.data[0]).not.toHaveProperty('application_count');
      const owner = await svc.findAll(alumnus(3), {});
      expect(owner.data[0]).toHaveProperty('application_count', 4);
    });
  });
});

describe('ApplicationsService', () => {
  const db: Record<string, any> = {
    alumniJobApplication: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    alumniProfile: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    job: jest.fn(),
    profile: jest.fn(),
    lock: jest.fn(),
    application: jest.fn(),
  };
  const audit = { log: jest.fn(), trail: jest.fn() };
  const notifications = { notifyAlumni: jest.fn(), notifyStaff: jest.fn() };
  const files = {
    save: jest.fn(),
    remove: jest.fn(),
    exists: jest.fn(),
    resolve: jest.fn(),
  };
  const svc = new ApplicationsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
    files as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.job.mockResolvedValue(job());
    lookup.profile.mockResolvedValue({
      alumni_id: 7,
      is_active: true,
      full_name: 'Bob',
    });
    db.alumniJobApplication.findUnique.mockResolvedValue(null);
    db.alumniJobApplication.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ application_id: 50, ...data }),
    );
    db.alumniProfile.findUnique.mockResolvedValue({ email: 'p@x.com' });
  });

  describe('apply', () => {
    it('an unverified alumnus cannot apply', async () => {
      await expect(
        svc.apply(alumnus(7, false) as never, 1, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cannot apply as someone else', async () => {
      await expect(
        svc.apply(alumnus(7) as never, 1, { alumni_id: 8 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a closed posting takes no applications', async () => {
      lookup.job.mockResolvedValue(job({ status: 'closed' }));
      expect(await code(svc.apply(alumnus(7) as never, 1, {}))).toBe(
        'JOB_CLOSED',
      );
    });

    it('an expired posting takes no applications even if its stored status is still open', async () => {
      lookup.job.mockResolvedValue(
        job({ expiry_date: new Date(Date.now() - HOUR) }),
      );
      expect(await code(svc.apply(alumnus(7) as never, 1, {}))).toBe(
        'JOB_EXPIRED',
      );
      expect(db.alumniJobApplication.create).not.toHaveBeenCalled();
    });

    it('cannot apply to your own posting', async () => {
      lookup.job.mockResolvedValue(job({ posted_by_alumni_id: 7 }));
      expect(await code(svc.apply(alumnus(7) as never, 1, {}))).toBe('OWN_JOB');
    });

    it('one application per alumnus per job (409)', async () => {
      db.alumniJobApplication.findUnique.mockResolvedValue({
        application_id: 9,
        status: 'applied',
      });
      expect(await code(svc.apply(alumnus(7) as never, 1, {}))).toBe(
        'ALREADY_APPLIED',
      );
    });

    it('a withdrawn application is re-opened, not duplicated', async () => {
      db.alumniJobApplication.findUnique.mockResolvedValue({
        application_id: 9,
        status: 'withdrawn',
        resume_url: null,
      });
      db.alumniJobApplication.update.mockResolvedValue({
        application_id: 9,
        status: 'applied',
      });
      const out = await svc.apply(alumnus(7), 1, {});
      expect(out.application_id).toBe(9);
      expect(db.alumniJobApplication.create).not.toHaveBeenCalled();
    });

    it('locks the posting so closing / expiring cannot interleave with applying', async () => {
      await svc.apply(alumnus(7), 1, {});
      expect(lookup.lock).toHaveBeenCalledWith(db, 'job', 'inst-1', 1);
    });

    it('notifies the alumnus poster, or staff for a partner-company posting; storage paths are never returned', async () => {
      const out = await svc.apply(alumnus(7), 1, {});
      expect(notifications.notifyAlumni).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'job_application_received' }),
        expect.objectContaining({ alumni_id: 3 }),
      );
      expect(out).not.toHaveProperty('resume_path');
      lookup.job.mockResolvedValue(job({ posted_by_alumni_id: null }));
      await svc.apply(alumnus(7), 1, {});
      expect(notifications.notifyStaff).toHaveBeenCalled();
    });

    it('staff must name the applicant', async () => {
      expect(await code(svc.apply(staff as never, 1, {}))).toBe(
        'ALUMNI_ID_REQUIRED',
      );
    });
  });

  describe('status changes', () => {
    const app = (over: Record<string, unknown> = {}) => ({
      application_id: 50,
      job_id: 1,
      status: 'applied',
      applicant_alumni_id: 7,
      job: job({ posted_by_alumni_id: 3 }),
      ...over,
    });

    it('only the job poster or staff can change an application status', async () => {
      lookup.application.mockResolvedValue(app());
      await expect(
        svc.updateStatus(alumnus(7) as never, 50, { status: 'hired' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        svc.updateStatus(alumnus(9) as never, 50, { status: 'hired' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates the transition and uses compare-and-set on the previous status', async () => {
      lookup.application.mockResolvedValue(app({ status: 'hired' }));
      expect(
        await code(
          svc.updateStatus(staff as never, 50, { status: 'rejected' }),
        ),
      ).toBe('INVALID_STATUS_TRANSITION');
      lookup.application.mockResolvedValue(app());
      db.alumniJobApplication.updateMany.mockResolvedValue({ count: 1 });
      await svc.updateStatus(alumnus(3), 50, {
        status: 'shortlisted',
        note: 'good',
      });
      expect(db.alumniJobApplication.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { application_id: 50, status: 'applied' },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'status_change',
          oldStatus: 'applied',
          newStatus: 'shortlisted',
        }),
      );
      expect(notifications.notifyAlumni).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'application_status_changed' }),
        expect.objectContaining({ alumni_id: 7 }),
      );
    });

    it('a concurrent change returns 409 instead of overwriting', async () => {
      lookup.application.mockResolvedValue(app());
      db.alumniJobApplication.updateMany.mockResolvedValue({ count: 0 });
      expect(
        await code(
          svc.updateStatus(staff as never, 50, { status: 'rejected' }),
        ),
      ).toBe('APPLICATION_CHANGED');
    });

    it('withdrawal: only the applicant, and only while applied / shortlisted', async () => {
      lookup.application.mockResolvedValue(app());
      await expect(svc.withdraw(alumnus(9) as never, 50)).rejects.toThrow(
        /not found/,
      );
      lookup.application.mockResolvedValue(app({ status: 'hired' }));
      expect(await code(svc.withdraw(alumnus(7) as never, 50))).toBe(
        'INVALID_STATUS_TRANSITION',
      );
    });
  });

  describe('visibility', () => {
    const app = {
      application_id: 50,
      applicant_alumni_id: 7,
      job: job({ posted_by_alumni_id: 3 }),
      resume_path: 'p',
      resume_mime: 'application/pdf',
    };

    it('an application is visible to its applicant, the poster and staff — nobody else', async () => {
      lookup.application.mockResolvedValue(app);
      db.alumniProfile.findUnique.mockResolvedValue({});
      await expect(svc.findOne(alumnus(9) as never, 50)).rejects.toThrow(
        /not found/,
      );
      await expect(svc.findOne(alumnus(7) as never, 50)).resolves.toBeDefined();
      await expect(svc.findOne(alumnus(3) as never, 50)).resolves.toBeDefined();
      await expect(svc.findOne(staff as never, 50)).resolves.toBeDefined();
    });

    it('resume download is closed to third parties', async () => {
      lookup.application.mockResolvedValue(app);
      await expect(
        svc.resumeForDownload(alumnus(9) as never, 50),
      ).rejects.toThrow(/not found/);
    });

    it('applications of a job are listed only for its poster or staff', async () => {
      lookup.job.mockResolvedValue(job({ posted_by_alumni_id: 3 }));
      await expect(svc.listForJob(alumnus(7) as never, 1, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('an alumnus lists only their own application history whatever filter they send', async () => {
      db.$transaction.mockImplementation((ops: unknown) =>
        Promise.all(ops as Promise<unknown>[]),
      );
      const findMany = jest.fn().mockResolvedValue([]);
      db.alumniJobApplication.findMany = findMany;
      db.alumniJobApplication.count = jest.fn().mockResolvedValue(0);
      await svc.findAll(alumnus(7), { applicant_alumni_id: 99 });
      expect(findMany.mock.calls[0][0].where.applicant_alumni_id).toBe(7);
    });
  });
});
