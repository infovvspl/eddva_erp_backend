/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AlumniService } from './alumni.service';
import { EmploymentService } from './employment.service';
import { GroupsService } from './groups.service';
import { AlumniRegistrationService } from '../auth/alumni-registration.service';
import { BusinessException } from '../common/business-exception';

const officer = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Olivia',
  user_role: 'Officer',
  is_institute_admin: false,
};
const alumnus = (id = 7, verified = true) => ({
  ...officer,
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
const profile = (over: Record<string, unknown> = {}) => ({
  alumni_id: 7,
  institute_id: 'inst-1',
  full_name: 'Alice Anand',
  email: 'alice@example.com',
  batch_year: 2015,
  graduation_year: 2015,
  is_active: true,
  verification_status: 'pending',
  visibility: 'alumni_only',
  photo_path: null,
  photo_mime: null,
  ...over,
});
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
  });

describe('AlumniRegistrationService (self-registration)', () => {
  const db: Record<string, any> = {
    alumniProfile: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    alumniUserDynamicRole: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const auth = { buildLogin: jest.fn() };
  const roles = { ensure: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyAlumni: jest.fn(), notifyStaff: jest.fn() };
  const svc = new AlumniRegistrationService(
    db as never,
    auth as never,
    roles as never,
    audit as never,
    notifications as never,
  );
  const dto = {
    institute_id: 'inst-1',
    full_name: 'Alice Anand',
    email: 'alice@example.com',
    password: 'AlicePass#1',
    batch_year: 2015,
  } as never;

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    db.alumniProfile.findFirst.mockResolvedValue(null);
    db.alumniUserDynamicRole.findFirst.mockResolvedValue(null);
    db.alumniProfile.count.mockResolvedValue(0);
    roles.ensure.mockResolvedValue({ role_id: 4 });
    db.alumniProfile.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({
        alumni_id: 11,
        verification_status: 'pending',
        ...data,
      }),
    );
    db.alumniUserDynamicRole.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ id: 1, ...data, role: { name: 'Alumni' } }),
    );
    auth.buildLogin.mockReturnValue({ alumni_token: 't', user: {} });
  });

  it('creates a PENDING self-registered profile and one linked portal account together', async () => {
    const out = await svc.register(dto);
    expect(out).toMatchObject({
      alumni_id: 11,
      verification_status: 'pending',
      alumni_token: 't',
    });
    expect(db.alumniProfile.create.mock.calls[0][0].data).toMatchObject({
      source: 'self_registered',
      verification_status: 'pending',
      visibility: 'alumni_only',
      contact_visible: false,
    });
    const account = db.alumniUserDynamicRole.create.mock.calls[0][0].data;
    expect(account).toMatchObject({
      alumni_id: 11,
      eddva_user_id: 'alumni-11',
      username: 'alice@example.com',
      role_id: 4,
    });
    expect(
      await bcrypt.compare('AlicePass#1', String(account.password_hash)),
    ).toBe(true);
    expect(account.password_hash).not.toContain('AlicePass');
  });

  it('never claims an existing profile with the same e-mail or student reference (no account takeover) — 409', async () => {
    db.alumniProfile.findFirst.mockResolvedValue({ alumni_id: 2 });
    expect(await code(svc.register(dto))).toBe('ALUMNI_ALREADY_REGISTERED');
    expect(db.alumniProfile.create).not.toHaveBeenCalled();
    expect(db.alumniUserDynamicRole.create).not.toHaveBeenCalled();
    const where = db.alumniProfile.findFirst.mock.calls[0][0].where;
    expect(where.institute_id).toBe('inst-1');
    expect(where.OR).toEqual([{ email: 'alice@example.com' }]);
  });

  it('also checks the student reference when one is supplied', async () => {
    db.alumniProfile.findFirst.mockResolvedValue({ alumni_id: 2 });
    await code(
      svc.register({ ...(dto as object), student_ref: 'STU-1' } as never),
    );
    expect(db.alumniProfile.findFirst.mock.calls[0][0].where.OR).toContainEqual(
      { student_ref: 'STU-1' },
    );
  });

  it('an e-mail already used as a login name is a duplicate too', async () => {
    db.alumniUserDynamicRole.findFirst.mockResolvedValue({ id: 5 });
    expect(await code(svc.register(dto))).toBe('ALUMNI_ALREADY_REGISTERED');
  });

  it('two racing registrations: the unique index turns the loser into the same clean 409', async () => {
    db.alumniProfile.create.mockRejectedValue(uniqueViolation());
    await expect(svc.register(dto)).rejects.toThrow(/already exists/);
  });

  it('rejects impossible years before touching the database', async () => {
    expect(
      await code(
        svc.register({ ...(dto as object), batch_year: 2999 } as never),
      ),
    ).toBe('INVALID_YEAR');
    expect(db.alumniProfile.findFirst).not.toHaveBeenCalled();
  });

  it('flags a same-name-same-batch lookalike for staff without telling the registrant', async () => {
    db.alumniProfile.count.mockResolvedValue(1);
    const out = await svc.register(dto);
    expect(JSON.stringify(out)).not.toMatch(/lookalike|duplicate/i);
    expect(notifications.notifyStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'verification_requested',
        message: expect.stringContaining('share this name and batch'),
      }),
    );
  });

  it('audits the registration as the alumnus, and notifies both sides', async () => {
    await svc.register(dto);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ eddva_user_id: 'alumni-11', alumni_id: 11 }),
      expect.objectContaining({
        action: 'self_register',
        newStatus: 'pending',
      }),
    );
    expect(notifications.notifyAlumni).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'registration_received' }),
      expect.anything(),
    );
    expect(notifications.notifyStaff).toHaveBeenCalled();
  });
});

describe('AlumniService', () => {
  const db: Record<string, any> = {
    alumniProfile: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    alumniUserDynamicRole: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const lookup = { profile: jest.fn() };
  const audit = { log: jest.fn(), trail: jest.fn() };
  const notifications = { notifyAlumni: jest.fn(), notifyStaff: jest.fn() };
  const roles = { ensure: jest.fn() };
  const files = {
    save: jest.fn(),
    remove: jest.fn(),
    exists: jest.fn(),
    resolve: jest.fn(),
  };
  const svc = new AlumniService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
    roles as never,
    files as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: unknown) =>
      typeof fn === 'function'
        ? (fn as (tx: unknown) => unknown)(db)
        : Promise.all(fn as Array<Promise<unknown>>),
    );
    lookup.profile.mockResolvedValue(profile());
    db.alumniProfile.findFirst.mockResolvedValue(null);
    db.alumniProfile.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ alumni_id: 20, ...data }),
    );
    db.alumniProfile.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...profile(), ...data }),
    );
    db.alumniProfile.findMany.mockResolvedValue([]);
    db.alumniProfile.count.mockResolvedValue(0);
  });

  describe('staff-created alumni', () => {
    const dto = {
      full_name: 'Bob',
      email: 'bob@example.com',
      batch_year: 2015,
    } as never;

    it('are verified by default (staff vouch for them) and recorded as staff-created', async () => {
      const out = await svc.create(officer, dto);
      expect(out).toMatchObject({
        source: 'staff_created',
        verification_status: 'verified',
        verified_by: 'u1',
      });
    });

    it('can be routed through the verification queue instead', async () => {
      const out = await svc.create(officer, {
        ...(dto as object),
        verification_status: 'pending',
      } as never);
      expect(out).toMatchObject({
        verification_status: 'pending',
        verified_by: null,
      });
    });

    it('a duplicate e-mail or student reference names the existing record (409)', async () => {
      db.alumniProfile.findFirst.mockResolvedValue({
        alumni_id: 3,
        email: 'bob@example.com',
        student_ref: null,
      });
      expect(await code(svc.create(officer as never, dto))).toBe(
        'ALUMNI_DUPLICATE',
      );
    });

    it('a unique violation that slips past the check is still a 409', async () => {
      db.alumniProfile.create.mockRejectedValue(uniqueViolation());
      await expect(svc.create(officer as never, dto)).rejects.toThrow(
        /already exists/,
      );
    });

    it('graduation before batch is invalid', async () => {
      expect(
        await code(
          svc.create(
            officer as never,
            { ...(dto as object), graduation_year: 2010 } as never,
          ),
        ),
      ).toBe('INVALID_YEAR');
    });
  });

  describe('profile updates', () => {
    it('an alumnus may change only their own safe fields', async () => {
      await expect(
        svc.update(alumnus(7) as never, 7, { phone: '+91 98765 43210' }),
      ).resolves.toBeDefined();
      await expect(
        svc.update(alumnus(7) as never, 8, { city: 'X' }),
      ).rejects.toThrow(/only modify your own/);
    });

    it.each([
      ['email'],
      ['batch_year'],
      ['graduation_year'],
      ['program'],
      ['full_name'],
      ['student_ref'],
    ])(
      'an alumnus cannot change %s (facts that verification vouched for)',
      async (field) => {
        await expect(
          svc.update(alumnus(7) as never, 7, {
            [field]: field.includes('year') ? 2000 : 'x',
          }),
        ).rejects.toThrow(ForbiddenException);
        expect(db.alumniProfile.update).not.toHaveBeenCalled();
      },
    );

    it('staff can change anything; changing the e-mail also renames the linked login', async () => {
      await svc.update(officer, 7, {
        email: 'new@example.com',
        full_name: 'Alice B',
      });
      expect(db.alumniUserDynamicRole.updateMany).toHaveBeenCalledWith({
        where: { alumni_id: 7 },
        data: { username: 'new@example.com', user_email: 'new@example.com' },
      });
      expect(db.alumniUserDynamicRole.updateMany).toHaveBeenCalledWith({
        where: { alumni_id: 7 },
        data: { user_name: 'Alice B' },
      });
    });

    it('cannot move an e-mail onto one that already exists', async () => {
      db.alumniProfile.findFirst.mockResolvedValue({
        alumni_id: 9,
        email: 'taken@example.com',
        student_ref: null,
      });
      expect(
        await code(
          svc.update(officer as never, 7, { email: 'taken@example.com' }),
        ),
      ).toBe('ALUMNI_DUPLICATE');
    });
  });

  describe('verification workflow', () => {
    it('verify is a compare-and-set: a second officer verifying at the same time gets 409', async () => {
      db.alumniProfile.updateMany.mockResolvedValue({ count: 0 });
      expect(await code(svc.verify(officer as never, 7))).toBe(
        'ALREADY_VERIFIED',
      );
      expect(notifications.notifyAlumni).not.toHaveBeenCalled();
    });

    it('verify records the officer, audits old → new status and notifies the alumnus', async () => {
      db.alumniProfile.updateMany.mockResolvedValue({ count: 1 });
      await svc.verify(officer, 7);
      const data = db.alumniProfile.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({
        verification_status: 'verified',
        verified_by: 'u1',
        rejection_reason: null,
      });
      expect(audit.log).toHaveBeenCalledWith(
        officer,
        expect.objectContaining({
          action: 'verify',
          oldStatus: 'pending',
          newStatus: 'verified',
        }),
      );
      expect(notifications.notifyAlumni).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'verification_approved' }),
        expect.anything(),
      );
    });

    it('reject keeps the (optional) reason, clears any prior verification and tells the alumnus', async () => {
      db.alumniProfile.updateMany.mockResolvedValue({ count: 1 });
      await svc.reject(officer, 7, { reason: 'Not in records' });
      expect(db.alumniProfile.updateMany.mock.calls[0][0].data).toMatchObject({
        verification_status: 'rejected',
        rejection_reason: 'Not in records',
        verified_at: null,
        verified_by: null,
      });
      expect(notifications.notifyAlumni).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'verification_rejected',
          message: expect.stringContaining('Not in records'),
        }),
        expect.anything(),
      );
      await svc.reject(officer, 7, {});
    });

    it('an already verified alumnus cannot re-submit; a rejected one can, going back to pending', async () => {
      lookup.profile.mockResolvedValue(
        profile({ verification_status: 'verified' }),
      );
      expect(await code(svc.submitVerification(alumnus(7) as never, {}))).toBe(
        'ALREADY_VERIFIED',
      );
      lookup.profile.mockResolvedValue(
        profile({ verification_status: 'rejected' }),
      );
      const out = await svc.submitVerification(alumnus(7), {
        note: 'house Blue',
      });
      expect(out).toMatchObject({ verification_status: 'pending' });
      expect(notifications.notifyStaff).toHaveBeenCalled();
    });

    it('portal-only endpoints refuse staff accounts', async () => {
      await expect(svc.me(officer as never)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        svc.submitVerification(officer as never, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('verification history is the verification-related slice of the audit trail', async () => {
      audit.trail.mockResolvedValue([
        { action: 'verify' },
        { action: 'update' },
        { action: 'reject' },
        { action: 'deactivate' },
      ]);
      const h = await svc.verificationHistory(officer, 7);
      expect(h.map((x: { action: string }) => x.action)).toEqual([
        'verify',
        'reject',
      ]);
    });
  });

  describe('directory visibility', () => {
    it('a peer cannot open a private profile; the owner and staff can', async () => {
      lookup.profile.mockResolvedValue(
        profile({ visibility: 'private', verification_status: 'verified' }),
      );
      await expect(svc.findOne(alumnus(9) as never, 7)).rejects.toThrow(
        /not found/,
      );
      await expect(svc.findOne(alumnus(7) as never, 7)).resolves.toBeDefined();
      await expect(svc.findOne(officer as never, 7)).resolves.toBeDefined();
    });

    it('the directory query for alumni is wrapped in the visibility filter; staff are unrestricted', async () => {
      await svc.findAll(alumnus(9), {});
      const alumniWhere = JSON.stringify(
        db.alumniProfile.findMany.mock.calls[0][0].where,
      );
      expect(alumniWhere).toContain('"verification_status":"verified"');
      expect(alumniWhere).toContain('"alumni_id":9');
      await svc.findAll(officer, {});
      expect(
        JSON.stringify(db.alumniProfile.findMany.mock.calls[1][0].where),
      ).not.toContain('"verification_status":"verified"');
    });

    it('only staff can search by e-mail or student reference', async () => {
      await svc.findAll(alumnus(9), { search: 'x@y.com' });
      expect(
        JSON.stringify(db.alumniProfile.findMany.mock.calls[0][0].where),
      ).not.toContain('"email"');
      await svc.findAll(officer, { search: 'x@y.com' });
      expect(
        JSON.stringify(db.alumniProfile.findMany.mock.calls[1][0].where),
      ).toContain('"email"');
    });

    it('staff-only filters (verification, visibility, inactive) are ignored for alumni', async () => {
      await svc.findAll(alumnus(9), {
        verification_status: 'pending',
        include_inactive: true,
      } as never);
      const where = JSON.stringify(
        db.alumniProfile.findMany.mock.calls[0][0].where,
      );
      expect(where).not.toContain('"pending"');
    });

    it('the public directory is scoped to one institute, public + verified, and paged small', async () => {
      await svc.publicDirectory({
        institute_id: 'inst-1',
        limit: 500,
      });
      const args = db.alumniProfile.findMany.mock.calls[0][0];
      expect(args.take).toBe(50);
      expect(args.where).toMatchObject({
        institute_id: 'inst-1',
        visibility: 'public',
        verification_status: 'verified',
        is_active: true,
      });
    });

    it('a private photo is hidden from peers', async () => {
      lookup.profile.mockResolvedValue(
        profile({
          visibility: 'private',
          verification_status: 'verified',
          photo_path: 'p',
          photo_mime: 'image/png',
        }),
      );
      files.exists.mockResolvedValue(true);
      await expect(
        svc.photoForDownload(alumnus(9) as never, 7),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('portal accounts', () => {
    it('issuing a login for an inactive profile is refused', async () => {
      lookup.profile.mockResolvedValue(profile({ is_active: false }));
      expect(
        await code(
          svc.issueAccount(officer as never, 7, { password: 'Passw0rd!!' }),
        ),
      ).toBe('ALUMNI_INACTIVE');
    });

    it('an e-mail already used as a different account login blocks it', async () => {
      db.alumniUserDynamicRole.findFirst.mockResolvedValue({ id: 3 });
      expect(
        await code(
          svc.issueAccount(officer as never, 7, { password: 'Passw0rd!!' }),
        ),
      ).toBe('USERNAME_TAKEN');
    });

    it('creates the account once and resets the password thereafter (one account per profile)', async () => {
      db.alumniUserDynamicRole.findFirst.mockResolvedValue(null);
      roles.ensure.mockResolvedValue({ role_id: 4 });
      db.alumniUserDynamicRole.findUnique.mockResolvedValueOnce(null);
      db.alumniUserDynamicRole.create.mockResolvedValue({
        username: 'alice@example.com',
        is_active: true,
      });
      await svc.issueAccount(officer, 7, { password: 'Passw0rd!!' });
      expect(db.alumniUserDynamicRole.create).toHaveBeenCalled();
      db.alumniUserDynamicRole.findUnique.mockResolvedValueOnce({ id: 9 });
      db.alumniUserDynamicRole.update.mockResolvedValue({
        username: 'alice@example.com',
        is_active: true,
      });
      await svc.issueAccount(officer, 7, {
        password: 'Another#Pass1',
      });
      expect(db.alumniUserDynamicRole.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 9 },
          data: expect.objectContaining({ is_active: true }),
        }),
      );
      const out = await svc.issueAccount(officer, 7, {
        password: 'Another#Pass1',
      });
      expect(out).not.toHaveProperty('password_hash');
    });
  });
});

describe('EmploymentService', () => {
  const db: Record<string, any> = {
    alumniEmployment: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    alumniProfile: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { profile: jest.fn(), employment: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new EmploymentService(
    db as never,
    lookup as never,
    audit as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.profile.mockResolvedValue(profile());
    db.alumniEmployment.findMany.mockResolvedValue([]);
    db.alumniEmployment.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ employment_id: 5, ...data }),
    );
  });
  const emp = { company: 'Acme', designation: 'PM', start_date: '2020-01-01' };

  it('a past position needs an end date that is not before the start', async () => {
    expect(await code(svc.create(alumnus(7) as never, 7, emp))).toBe(
      'INVALID_EMPLOYMENT_DATES',
    );
    expect(
      await code(
        svc.create(alumnus(7) as never, 7, { ...emp, end_date: '2019-12-31' }),
      ),
    ).toBe('INVALID_EMPLOYMENT_DATES');
    await expect(
      svc.create(alumnus(7) as never, 7, { ...emp, end_date: '2020-01-01' }),
    ).resolves.toBeDefined();
  });

  it('a current position must not have an end date', async () => {
    expect(
      await code(
        svc.create(alumnus(7) as never, 7, {
          ...emp,
          is_current: true,
          end_date: '2021-01-01',
        }),
      ),
    ).toBe('INVALID_EMPLOYMENT_DATES');
  });

  it('an impossible calendar date is a 400', async () => {
    await expect(
      svc.create(alumnus(7) as never, 7, {
        ...emp,
        start_date: '2020-02-30',
        end_date: '2020-03-01',
      }),
    ).rejects.toThrow(/valid calendar date/);
  });

  it('marking a position current closes the previous current one and syncs the profile', async () => {
    db.alumniEmployment.findMany.mockResolvedValue([
      { employment_id: 2, start_date: new Date('2018-01-01') },
    ]);
    await svc.create(alumnus(7), 7, {
      ...emp,
      is_current: true,
      industry: 'Tech',
    });
    expect(db.alumniEmployment.update).toHaveBeenCalledWith({
      where: { employment_id: 2 },
      data: { is_current: false, end_date: new Date('2020-01-01') },
    });
    expect(db.alumniProfile.update).toHaveBeenCalledWith({
      where: { alumni_id: 7 },
      data: {
        current_company: 'Acme',
        current_designation: 'PM',
        industry: 'Tech',
      },
    });
  });

  it("an alumnus cannot touch someone else's timeline", async () => {
    await expect(
      svc.create(alumnus(9) as never, 7, { ...emp, end_date: '2021-01-01' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(svc.remove(alumnus(9) as never, 7, 1)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(svc.setCurrent(alumnus(9) as never, 7, 1)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deleting is a soft delete', async () => {
    lookup.employment.mockResolvedValue({ employment_id: 1 });
    await svc.remove(alumnus(7), 7, 1);
    expect(db.alumniEmployment.update).toHaveBeenCalledWith({
      where: { employment_id: 1 },
      data: { is_active: false, is_current: false },
    });
  });

  it('peers cannot read the timeline of a profile they may not see', async () => {
    lookup.profile.mockResolvedValue(
      profile({ visibility: 'private', verification_status: 'verified' }),
    );
    await expect(svc.findAll(alumnus(9) as never, 7)).rejects.toThrow(
      /not found/,
    );
  });
});

describe('GroupsService', () => {
  const db: Record<string, any> = {
    alumniGroup: { create: jest.fn(), update: jest.fn() },
    alumniProfile: { findMany: jest.fn() },
    alumniGroupMember: { createMany: jest.fn(), deleteMany: jest.fn() },
  };
  const lookup = { group: jest.fn(), profile: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new GroupsService(db as never, lookup as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    lookup.group.mockResolvedValue({ group_id: 1, is_active: true });
  });

  it('duplicate group names within a type are a 409', async () => {
    db.alumniGroup.create.mockRejectedValue(uniqueViolation());
    await expect(
      svc.create(officer as never, {
        name: 'Class of 2015',
        group_type: 'batch',
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('bulk add skips people already in the group instead of failing or duplicating them', async () => {
    db.alumniProfile.findMany.mockResolvedValue([
      { alumni_id: 1 },
      { alumni_id: 2 },
      { alumni_id: 3 },
    ]);
    db.alumniGroupMember.createMany.mockResolvedValue({ count: 1 });
    const out = await svc.addMembers(officer, 1, {
      alumni_ids: [1, 2, 3],
    });
    expect(out).toEqual({ group_id: 1, added: 1, skipped: 2 });
    expect(
      db.alumniGroupMember.createMany.mock.calls[0][0].skipDuplicates,
    ).toBe(true);
  });

  it('unknown or inactive alumni are reported and nothing is added', async () => {
    db.alumniProfile.findMany.mockResolvedValue([{ alumni_id: 1 }]);
    expect(
      await code(svc.addMembers(officer as never, 1, { alumni_ids: [1, 2] })),
    ).toBe('ALUMNI_NOT_FOUND');
    expect(db.alumniGroupMember.createMany).not.toHaveBeenCalled();
  });

  it('members cannot be added to a deactivated group', async () => {
    lookup.group.mockResolvedValue({ group_id: 1, is_active: false });
    expect(
      await code(svc.addMembers(officer as never, 1, { alumni_ids: [1] })),
    ).toBe('GROUP_INACTIVE');
  });

  it('removing someone who is not a member is a 404', async () => {
    db.alumniGroupMember.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.removeMember(officer as never, 1, 5)).rejects.toThrow(
      /not a member/,
    );
  });

  it('deleting a group is a soft delete that keeps its memberships', async () => {
    db.alumniGroup.update.mockResolvedValue({ group_id: 1, is_active: false });
    await svc.remove(officer, 1);
    expect(db.alumniGroup.update).toHaveBeenCalledWith({
      where: { group_id: 1 },
      data: { is_active: false },
    });
    expect(db.alumniGroupMember.deleteMany).not.toHaveBeenCalled();
  });
});
