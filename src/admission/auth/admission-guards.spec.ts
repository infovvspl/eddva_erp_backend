import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdmissionInstituteAdminViewOnlyGuard } from './admission-institute-admin-view-only.guard';
import { AdmissionJwtGuard } from './admission-jwt.guard';
import { AdmissionPermissionsGuard } from './admission-permissions.guard';
import { AdmissionPlatformUser } from './admission-auth.service';
import { AdmissionAccessService } from '../common/admission-access.service';

const staff: AdmissionPlatformUser = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Admission Officer',
  is_institute_admin: false,
};
const admin: AdmissionPlatformUser = {
  ...staff,
  eddva_user_id: 'a1',
  user_role: 'INSTITUTE_ADMIN',
  is_institute_admin: true,
};

const ctx = (req: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('AdmissionJwtGuard', () => {
  const auth = { verifyAdmissionToken: jest.fn() };
  const guard = new AdmissionJwtGuard(auth as never);

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
    auth.verifyAdmissionToken.mockReturnValue(staff);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer tok' },
    };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(auth.verifyAdmissionToken).toHaveBeenCalledWith('tok');
    expect(req.admissionUser).toBe(staff);
  });
});

describe('AdmissionInstituteAdminViewOnlyGuard', () => {
  const guard = new AdmissionInstituteAdminViewOnlyGuard();

  it('lets Institute Admin read', () => {
    expect(
      guard.canActivate(ctx({ admissionUser: admin, method: 'GET' })),
    ).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'blocks Institute Admin %s on operational routes',
    (method) => {
      expect(() =>
        guard.canActivate(ctx({ admissionUser: admin, method })),
      ).toThrow(ForbiddenException);
    },
  );

  it('does not restrict assigned staff', () => {
    expect(
      guard.canActivate(ctx({ admissionUser: staff, method: 'POST' })),
    ).toBe(true);
  });
});

describe('AdmissionPermissionsGuard', () => {
  const getPermissionRules = jest.fn();
  const access = { getPermissionRules } as unknown as AdmissionAccessService;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new AdmissionPermissionsGuard(reflector, access);
  const need = (...reqs: { resource: string; action: string }[]) =>
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(reqs);

  beforeEach(() => jest.clearAllMocks());

  it('passes routes with no requirement', async () => {
    need();
    await expect(
      guard.canActivate(ctx({ admissionUser: staff })),
    ).resolves.toBe(true);
  });

  it('Institute Admin bypasses permission checks (write blocking is the view-only guard’s job)', async () => {
    need({ resource: 'applications', action: 'read' });
    await expect(
      guard.canActivate(ctx({ admissionUser: admin })),
    ).resolves.toBe(true);
    expect(getPermissionRules).not.toHaveBeenCalled();
  });

  it('grants when the role holds the resource+action', async () => {
    need({ resource: 'documents', action: 'verify' });
    getPermissionRules.mockResolvedValue({
      rules: [{ resource: 'documents', actions: ['read', 'verify'] }],
      roleName: 'Officer',
    });
    await expect(
      guard.canActivate(ctx({ admissionUser: staff })),
    ).resolves.toBe(true);
  });

  it('denies (403) and names the missing permission', async () => {
    need({ resource: 'documents', action: 'verify' });
    getPermissionRules.mockResolvedValue({
      rules: [{ resource: 'documents', actions: ['read'] }],
      roleName: 'Clerk',
    });
    await expect(
      guard.canActivate(ctx({ admissionUser: staff })),
    ).rejects.toThrow(
      /lacks required permission 'verify' on resource 'documents'/,
    );
  });

  it('a user with no live assignment has no permissions', async () => {
    need({ resource: 'applications', action: 'read' });
    getPermissionRules.mockResolvedValue({ rules: [], roleName: 'Unassigned' });
    await expect(
      guard.canActivate(ctx({ admissionUser: staff })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires EVERY listed permission when several are declared', async () => {
    need(
      { resource: 'enquiries', action: 'convert' },
      { resource: 'applications', action: 'create' },
    );
    getPermissionRules.mockResolvedValue({
      rules: [{ resource: 'enquiries', actions: ['convert'] }],
      roleName: 'Half',
    });
    await expect(
      guard.canActivate(ctx({ admissionUser: staff })),
    ).rejects.toThrow(/'create' on resource 'applications'/);
  });
});
