import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { AlumniInstituteAdminViewOnlyGuard } from './alumni-institute-admin-view-only.guard';
import { AlumniJwtGuard } from './alumni-jwt.guard';
import { AlumniPermissionsGuard } from './alumni-permissions.guard';
import { AlumniAuthService, AlumniPlatformUser } from './alumni-auth.service';
import {
  ALUMNI_PERMISSIONS_KEY,
  ALUMNI_STAFF_ONLY_KEY,
} from './require-permissions.decorator';
import {
  AlumniAccessService,
  isAlumniPrincipal,
} from '../common/alumni-access.service';

const staff: AlumniPlatformUser = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Olivia',
  user_role: 'ALUMNI RELATIONS OFFICER',
  is_institute_admin: false,
};
const admin: AlumniPlatformUser = {
  ...staff,
  eddva_user_id: 'a1',
  user_role: 'INSTITUTE_ADMIN',
  is_institute_admin: true,
};
const portal: AlumniPlatformUser = {
  ...staff,
  eddva_user_id: 'alumni-7',
  user_role: 'ALUMNI',
};

const ctx = (req: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('AlumniJwtGuard', () => {
  const auth = { verifyAlumniToken: jest.fn() };
  const guard = new AlumniJwtGuard(auth as never);
  beforeEach(() => jest.clearAllMocks());

  it('rejects a missing Authorization header', () => {
    expect(() => guard.canActivate(ctx({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer scheme', () => {
    expect(() =>
      guard.canActivate(ctx({ headers: { authorization: 'Basic abc' } })),
    ).toThrow(UnauthorizedException);
  });

  it('attaches the verified user to the request', () => {
    auth.verifyAlumniToken.mockReturnValue(staff);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer tok' },
    };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(req.alumniUser).toBe(staff);
  });
});

describe('AlumniInstituteAdminViewOnlyGuard', () => {
  const guard = new AlumniInstituteAdminViewOnlyGuard();

  it('lets Institute Admin read', () => {
    expect(guard.canActivate(ctx({ alumniUser: admin, method: 'GET' }))).toBe(
      true,
    );
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'blocks Institute Admin %s on operational routes',
    (method) => {
      expect(() =>
        guard.canActivate(ctx({ alumniUser: admin, method })),
      ).toThrow(ForbiddenException);
    },
  );

  it('does not restrict assigned staff or alumni', () => {
    expect(guard.canActivate(ctx({ alumniUser: staff, method: 'POST' }))).toBe(
      true,
    );
    expect(guard.canActivate(ctx({ alumniUser: portal, method: 'POST' }))).toBe(
      true,
    );
  });
});

describe('AlumniPermissionsGuard', () => {
  const access = { getContext: jest.fn() };
  const reflector = new Reflector();
  const guard = new AlumniPermissionsGuard(reflector, access as never);
  const withMeta = (
    req: Record<string, unknown>,
    meta: { perms?: unknown; staffOnly?: boolean },
  ) => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === ALUMNI_PERMISSIONS_KEY
          ? meta.perms
          : key === ALUMNI_STAFF_ONLY_KEY
            ? meta.staffOnly
            : undefined,
      );
    return { context: ctx(req), spy };
  };
  beforeEach(() => jest.restoreAllMocks());
  beforeEach(() => access.getContext.mockReset());

  const officerCtx = {
    rules: [{ resource: 'events', actions: ['read', 'create'] }],
    roleName: 'Alumni Relations Officer',
    alumniId: null,
    verified: false,
  };
  const alumniCtx = {
    rules: [{ resource: 'events', actions: ['read'] }],
    roleName: 'Alumni',
    alumniId: 7,
    verified: true,
  };

  it('Institute Admin bypasses permission checks without a database lookup', async () => {
    const { context } = withMeta(
      { alumniUser: { ...admin } },
      { perms: [{ resource: 'events', action: 'create' }] },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(access.getContext).not.toHaveBeenCalled();
  });

  it('allows staff holding the permission and marks them as staff (no alumni_id)', async () => {
    access.getContext.mockResolvedValue(officerCtx);
    const user = { ...staff };
    const { context } = withMeta(
      { alumniUser: user },
      { perms: [{ resource: 'events', action: 'create' }] },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(isAlumniPrincipal(user)).toBe(false);
  });

  it('denies a role that lacks the permission, naming role/resource/action', async () => {
    access.getContext.mockResolvedValue(officerCtx);
    const { context } = withMeta(
      { alumniUser: { ...staff } },
      { perms: [{ resource: 'donations', action: 'confirm' }] },
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      /lacks required permission 'confirm' on resource 'donations'/,
    );
  });

  it('requires ALL permissions when several are declared', async () => {
    access.getContext.mockResolvedValue(officerCtx);
    const { context } = withMeta(
      { alumniUser: { ...staff } },
      {
        perms: [
          { resource: 'events', action: 'read' },
          { resource: 'events', action: 'cancel' },
        ],
      },
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('a revoked / deactivated account is refused even on a route with no permission requirement', async () => {
    access.getContext.mockResolvedValue(null);
    const { context } = withMeta({ alumniUser: { ...staff } }, {});
    await expect(guard.canActivate(context)).rejects.toThrow(
      /inactive or has been revoked/,
    );
  });

  it('takes alumni_id from the database row, never from the token', async () => {
    access.getContext.mockResolvedValue(alumniCtx);
    // A forged claim in the (already verified) user object is overwritten.
    const user: AlumniPlatformUser = { ...portal, alumni_id: 999 };
    const { context } = withMeta(
      { alumniUser: user },
      { perms: [{ resource: 'events', action: 'read' }] },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(user.alumni_id).toBe(7);
    expect(user.alumni_verified).toBe(true);
  });

  it('a staff account cannot pose as an alumnus: no alumni_id is set when the account has no linked profile', async () => {
    access.getContext.mockResolvedValue(officerCtx);
    const user: AlumniPlatformUser = { ...staff, alumni_id: 5 };
    const { context } = withMeta(
      { alumniUser: user },
      { perms: [{ resource: 'events', action: 'read' }] },
    );
    await guard.canActivate(context);
    expect(user.alumni_id).toBeUndefined();
  });

  it('@StaffOnly refuses portal accounts even when their role holds the permission', async () => {
    access.getContext.mockResolvedValue({
      ...alumniCtx,
      rules: [{ resource: 'newsletters', actions: ['send'] }],
    });
    const { context } = withMeta(
      { alumniUser: { ...portal } },
      { perms: [{ resource: 'newsletters', action: 'send' }], staffOnly: true },
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      /reserved for alumni-office staff/,
    );
  });

  it('@StaffOnly still admits staff', async () => {
    access.getContext.mockResolvedValue({
      ...officerCtx,
      rules: [{ resource: 'newsletters', actions: ['send'] }],
    });
    const { context } = withMeta(
      { alumniUser: { ...staff } },
      { perms: [{ resource: 'newsletters', action: 'send' }], staffOnly: true },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('AlumniAccessService', () => {
  const prisma = { alumniUserDynamicRole: { findFirst: jest.fn() } };
  const svc = new AlumniAccessService(prisma as never);
  beforeEach(() => jest.clearAllMocks());

  const row = (over: Record<string, unknown> = {}) => ({
    alumni_id: null,
    role: { name: 'Officer', permissions: [{ resource: 'a', actions: ['b'] }] },
    alumni: null,
    ...over,
  });

  it('resolves live rules from the assignment', async () => {
    prisma.alumniUserDynamicRole.findFirst.mockResolvedValue(row());
    const ctxRes = await svc.getContext(staff);
    expect(ctxRes).toEqual({
      rules: [{ resource: 'a', actions: ['b'] }],
      roleName: 'Officer',
      alumniId: null,
      verified: false,
    });
  });

  it('returns no context when there is no live assignment', async () => {
    prisma.alumniUserDynamicRole.findFirst.mockResolvedValue(null);
    expect(await svc.getContext(staff)).toBeNull();
  });

  it('a portal account whose profile was deactivated has no context', async () => {
    prisma.alumniUserDynamicRole.findFirst.mockResolvedValue(
      row({
        alumni_id: 7,
        alumni: {
          alumni_id: 7,
          is_active: false,
          verification_status: 'verified',
        },
      }),
    );
    expect(await svc.getContext(portal)).toBeNull();
  });

  it('verified reflects the live verification status', async () => {
    prisma.alumniUserDynamicRole.findFirst.mockResolvedValue(
      row({
        alumni_id: 7,
        alumni: {
          alumni_id: 7,
          is_active: true,
          verification_status: 'pending',
        },
      }),
    );
    expect((await svc.getContext(portal))?.verified).toBe(false);
    prisma.alumniUserDynamicRole.findFirst.mockResolvedValue(
      row({
        alumni_id: 7,
        alumni: {
          alumni_id: 7,
          is_active: true,
          verification_status: 'verified',
        },
      }),
    );
    expect((await svc.getContext(portal))?.verified).toBe(true);
  });

  it('Institute Admin always has permission; others need a matching rule', async () => {
    expect(await svc.hasPermission(admin, 'x', 'y')).toBe(true);
    prisma.alumniUserDynamicRole.findFirst.mockResolvedValue(row());
    expect(await svc.hasPermission(staff, 'a', 'b')).toBe(true);
    expect(await svc.hasPermission(staff, 'a', 'c')).toBe(false);
    await expect(svc.assertPermission(staff, 'a', 'c')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('AlumniAuthService token handling', () => {
  const prisma = {};
  const svc = new AlumniAuthService(prisma as never);
  const secret = 'unit-test-alumni-secret';
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.ALUMNI_JWT_SECRET;
    process.env.ALUMNI_JWT_SECRET = secret;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.ALUMNI_JWT_SECRET;
    else process.env.ALUMNI_JWT_SECRET = previous;
  });

  it('never trusts an alumni_id claim inside a token', () => {
    const token = jwt.sign(
      {
        eddva_user_id: 'u9',
        institute_id: 'inst-1',
        user_role: 'Officer',
        alumni_id: 42,
      },
      secret,
    );
    const user = svc.verifyAlumniToken(token);
    expect(user.alumni_id).toBeUndefined();
    expect(user.eddva_user_id).toBe('u9');
  });

  it('rejects a token signed with any other secret (e.g. the shared ERP secret)', () => {
    const token = jwt.sign(
      { eddva_user_id: 'u9', institute_id: 'inst-1', user_role: 'X' },
      'some-other-secret',
    );
    expect(() => svc.verifyAlumniToken(token)).toThrow(UnauthorizedException);
  });

  it('rejects a token missing user or institute', () => {
    const token = jwt.sign({ user_role: 'X' }, secret);
    expect(() => svc.verifyAlumniToken(token)).toThrow(UnauthorizedException);
  });

  it('fails closed when ALUMNI_JWT_SECRET is not configured (no fallback to JWT_SECRET)', () => {
    delete process.env.ALUMNI_JWT_SECRET;
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'erp-secret';
    try {
      expect(() => svc.verifyAlumniToken('x.y.z')).toThrow(
        /ALUMNI_JWT_SECRET must be set/,
      );
    } finally {
      process.env.ALUMNI_JWT_SECRET = secret;
      if (original === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = original;
    }
  });

  it('marks the ERP administrator role names as institute admin', () => {
    const token = jwt.sign(
      {
        eddva_user_id: 'a',
        institute_id: 'i',
        user_role: 'institute administrator',
      },
      secret,
    );
    expect(svc.verifyAlumniToken(token).is_institute_admin).toBe(true);
  });
});
