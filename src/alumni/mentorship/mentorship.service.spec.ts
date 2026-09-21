/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MatchesService } from './matches.service';
import { MentorsService, syncMentorStatus } from './mentors.service';
import { BusinessException } from '../common/business-exception';

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
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
  });

describe('syncMentorStatus', () => {
  const tx: Record<string, any> = {
    alumniMentorProfile: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    alumniMentorshipMatch: { count: jest.fn() },
  };
  beforeEach(() => {
    jest.resetAllMocks();
    tx.alumniMentorProfile.update.mockImplementation(
      ({ data }: { data: object }) => Promise.resolve(data),
    );
  });

  it('becomes fully_booked exactly when active mentees reach the maximum', async () => {
    tx.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue({
      mentor_id: 1,
      status: 'available',
      max_mentees: 2,
    });
    tx.alumniMentorshipMatch.count.mockResolvedValue(2);
    await syncMentorStatus(tx as never, 1);
    expect(tx.alumniMentorProfile.update).toHaveBeenCalledWith({
      where: { mentor_id: 1 },
      data: { status: 'fully_booked' },
    });
  });

  it('frees up again when a match ends', async () => {
    tx.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue({
      mentor_id: 1,
      status: 'fully_booked',
      max_mentees: 2,
    });
    tx.alumniMentorshipMatch.count.mockResolvedValue(1);
    await syncMentorStatus(tx as never, 1);
    expect(tx.alumniMentorProfile.update).toHaveBeenCalledWith({
      where: { mentor_id: 1 },
      data: { status: 'available' },
    });
  });

  it('never overrides a mentor who chose to be inactive', async () => {
    tx.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue({
      mentor_id: 1,
      status: 'inactive',
      max_mentees: 2,
    });
    await syncMentorStatus(tx as never, 1);
    expect(tx.alumniMentorProfile.update).not.toHaveBeenCalled();
  });

  it('does not write when nothing changed', async () => {
    tx.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue({
      mentor_id: 1,
      status: 'available',
      max_mentees: 3,
    });
    tx.alumniMentorshipMatch.count.mockResolvedValue(1);
    await syncMentorStatus(tx as never, 1);
    expect(tx.alumniMentorProfile.update).not.toHaveBeenCalled();
  });
});

describe('MentorsService', () => {
  const db: Record<string, any> = {
    alumniMentorProfile: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    alumniMentorshipMatch: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { profile: jest.fn(), mentor: jest.fn(), lock: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyAlumni: jest.fn() };
  const svc = new MentorsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.profile.mockResolvedValue({
      alumni_id: 7,
      is_active: true,
      email: 'a@x.com',
    });
    db.alumniMentorProfile.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ mentor_id: 1, status: 'available', ...data }),
    );
  });

  it('only a verified alumnus can become a mentor, and only as themselves', async () => {
    await expect(
      svc.create(alumnus(7, false) as never, { expertise_areas: ['x'] }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc.create(alumnus(7) as never, { expertise_areas: ['x'], alumni_id: 8 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('expertise is stored normalised (queryable tags, not a comma-separated string)', async () => {
    const m = await svc.create(alumnus(7), {
      expertise_areas: [' Leadership ', 'leadership', 'Career Coaching'],
    });
    expect(m.expertise_areas).toEqual(['leadership', 'career coaching']);
    expect(m.max_mentees).toBe(3);
  });

  it('a second mentor profile for the same alumnus is a 409', async () => {
    db.alumniMentorProfile.create.mockRejectedValue(uniqueViolation());
    expect(
      await code(svc.create(alumnus(7) as never, { expertise_areas: ['x'] })),
    ).toBe('ALREADY_MENTOR');
  });

  it('staff must name the alumnus to enrol', async () => {
    expect(
      await code(svc.create(staff as never, { expertise_areas: ['x'] })),
    ).toBe('ALUMNI_ID_REQUIRED');
  });

  it('capacity cannot be lowered below the current active mentees', async () => {
    lookup.mentor.mockResolvedValue({
      mentor_id: 1,
      alumni_id: 7,
      status: 'available',
    });
    db.alumniMentorshipMatch.count.mockResolvedValue(3);
    expect(
      await code(svc.update(alumnus(7) as never, 1, { max_mentees: 2 })),
    ).toBe('CAPACITY_BELOW_ACTIVE_MENTEES');
  });

  it("nobody edits someone else's mentor profile", async () => {
    lookup.mentor.mockResolvedValue({
      mentor_id: 1,
      alumni_id: 3,
      status: 'available',
    });
    await expect(
      svc.update(alumnus(7) as never, 1, { bio: 'x' }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('MatchesService.create', () => {
  const db: Record<string, any> = {
    alumniMentorProfile: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    alumniMentorshipMatch: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findFirst2: jest.fn(),
    },
    $transaction: jest.fn(),
    alumniProfile: { findUnique: jest.fn() },
  };
  const lookup = {
    program: jest.fn(),
    mentor: jest.fn(),
    profile: jest.fn(),
    lock: jest.fn(),
    match: jest.fn(),
  };
  const audit = { log: jest.fn(), trail: jest.fn() };
  const notifications = { notifyAlumni: jest.fn() };
  const svc = new MatchesService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );
  const mentor = (over: Record<string, unknown> = {}) => ({
    mentor_id: 1,
    alumni_id: 3,
    status: 'available',
    max_mentees: 2,
    alumni: { alumni_id: 3, email: 'm@x.com', is_active: true },
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.program.mockResolvedValue({
      program_id: 1,
      name: 'P',
      status: 'open_for_signup',
    });
    lookup.mentor.mockResolvedValue({ mentor_id: 1 });
    lookup.profile.mockResolvedValue({
      alumni_id: 7,
      is_active: true,
      full_name: 'Dina',
      email: 'd@x.com',
    });
    db.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue(mentor());
    db.alumniMentorshipMatch.count.mockResolvedValue(0);
    db.alumniMentorshipMatch.findFirst.mockResolvedValue(null);
    db.alumniMentorshipMatch.create.mockResolvedValue({ match_id: 40 });
    // findOne() re-read at the end:
    jest.spyOn(svc, 'findOne').mockResolvedValue({ match_id: 40 } as never);
  });

  const dto = { mentor_id: 1, mentee_alumni_id: 7 };

  it('a mentee is either an alumnus or a current student, never both nor neither', async () => {
    expect(await code(svc.create(staff as never, 1, { mentor_id: 1 }))).toBe(
      'MENTEE_REQUIRED',
    );
    expect(
      await code(
        svc.create(staff as never, 1, {
          mentor_id: 1,
          mentee_alumni_id: 7,
          mentee_student_ref: 'S1',
          mentee_name: 'S',
        }),
      ),
    ).toBe('MENTEE_REQUIRED');
  });

  it('a current student is matched by reference without creating an alumni record, and needs a name', async () => {
    expect(
      await code(
        svc.create(staff as never, 1, {
          mentor_id: 1,
          mentee_student_ref: 'S1',
        }),
      ),
    ).toBe('MENTEE_NAME_REQUIRED');
    await svc.create(staff, 1, {
      mentor_id: 1,
      mentee_student_ref: 'S1',
      mentee_name: 'Sam',
    });
    expect(lookup.profile).not.toHaveBeenCalled();
    expect(db.alumniMentorshipMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mentee_alumni_id: undefined,
        mentee_student_ref: 'S1',
        mentee_name: 'Sam',
      }),
    });
  });

  it('a completed program takes no more matches', async () => {
    lookup.program.mockResolvedValue({
      program_id: 1,
      name: 'P',
      status: 'completed',
    });
    expect(await code(svc.create(staff as never, 1, dto))).toBe(
      'PROGRAM_NOT_MATCHING',
    );
  });

  it('an inactive mentor cannot be matched', async () => {
    db.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue(
      mentor({ status: 'inactive' }),
    );
    expect(await code(svc.create(staff as never, 1, dto))).toBe(
      'MENTOR_INACTIVE',
    );
  });

  it('a mentor cannot mentor themselves', async () => {
    lookup.profile.mockResolvedValue({
      alumni_id: 3,
      is_active: true,
      full_name: 'M',
      email: 'm@x.com',
    });
    expect(
      await code(
        svc.create(staff as never, 1, { mentor_id: 1, mentee_alumni_id: 3 }),
      ),
    ).toBe('SELF_MENTORING');
  });

  it('mentor capacity is enforced under the mentor row lock', async () => {
    db.alumniMentorshipMatch.count.mockResolvedValue(2);
    expect(await code(svc.create(staff as never, 1, dto))).toBe(
      'MENTOR_AT_CAPACITY',
    );
    expect(db.alumniMentorshipMatch.create).not.toHaveBeenCalled();
    expect(lookup.lock).toHaveBeenCalledWith(db, 'mentor', 'inst-1', 1);
  });

  it('a mentee cannot have two active mentors in one program', async () => {
    db.alumniMentorshipMatch.findFirst.mockResolvedValue({ match_id: 5 });
    expect(await code(svc.create(staff as never, 1, dto))).toBe(
      'MENTEE_ALREADY_MATCHED',
    );
  });

  it('a racing duplicate caught by the partial unique index is still a clean 409', async () => {
    db.alumniMentorshipMatch.create.mockRejectedValue(uniqueViolation());
    expect(await code(svc.create(staff as never, 1, dto))).toBe(
      'MENTEE_ALREADY_MATCHED',
    );
  });

  it('a successful match refreshes the mentor status, is audited and notifies both people', async () => {
    db.alumniMentorProfile.findUniqueOrThrow.mockResolvedValue(
      mentor({ status: 'available', max_mentees: 1 }),
    );
    db.alumniMentorshipMatch.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    db.alumniMentorProfile.update.mockResolvedValue({});
    await svc.create(staff, 1, dto);
    expect(db.alumniMentorProfile.update).toHaveBeenCalledWith({
      where: { mentor_id: 1 },
      data: { status: 'fully_booked' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      staff,
      expect.objectContaining({ action: 'create', newStatus: 'active' }),
    );
    expect(notifications.notifyAlumni).toHaveBeenCalledTimes(2);
  });
});

describe('MatchesService.updateStatus / visibility', () => {
  const db: Record<string, any> = {
    alumniMentorshipMatch: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    alumniMentorProfile: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    alumniProfile: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { match: jest.fn(), lock: jest.fn() };
  const audit = { log: jest.fn(), trail: jest.fn() };
  const notifications = { notifyAlumni: jest.fn() };
  const svc = new MatchesService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
  });

  it('a finished match cannot be re-opened or changed to the other end state', async () => {
    lookup.match.mockResolvedValue({
      match_id: 1,
      status: 'completed',
      mentor_id: 1,
    });
    expect(
      await code(
        svc.updateStatus(staff as never, 1, { status: 'discontinued' }),
      ),
    ).toBe('INVALID_STATUS_TRANSITION');
  });

  it('a concurrent change is a 409 and does not free capacity twice', async () => {
    lookup.match.mockResolvedValue({
      match_id: 1,
      status: 'active',
      mentor_id: 1,
    });
    db.alumniMentorshipMatch.updateMany.mockResolvedValue({ count: 0 });
    expect(
      await code(svc.updateStatus(staff as never, 1, { status: 'completed' })),
    ).toBe('MATCH_CHANGED');
    expect(db.alumniMentorProfile.update).not.toHaveBeenCalled();
  });

  it('alumni only see matches they are part of; staff filters are ignored for them', async () => {
    db.$transaction.mockImplementation((ops: unknown) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    db.alumniMentorshipMatch.findMany = jest.fn().mockResolvedValue([]);
    db.alumniMentorshipMatch.count.mockResolvedValue(0);
    await svc.findAll(alumnus(7), {
      mentor_id: 99,
      mentee_alumni_id: 99,
    });
    const where = db.alumniMentorshipMatch.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"alumni_id":7');
    expect(JSON.stringify(where)).toContain('"mentee_alumni_id":7');
    expect(JSON.stringify(where)).not.toContain('99');
  });
});
