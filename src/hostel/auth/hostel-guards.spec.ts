import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HostelInstituteAdminViewOnlyGuard } from './hostel-institute-admin-view-only.guard';
import { HostelJwtGuard } from './hostel-jwt.guard';
import { HostelPermissionsGuard } from './hostel-permissions.guard';
import { HostelPlatformUser } from './hostel-auth.service';
import { HostelAccessService } from '../common/hostel-access.service';

const staff: HostelPlatformUser = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Warden',
  is_institute_admin: false,
};
const admin: HostelPlatformUser = {
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

describe('HostelJwtGuard', () => {
  const auth = { verifyHostelToken: jest.fn() };
  const guard = new HostelJwtGuard(auth as never);

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
    auth.verifyHostelToken.mockReturnValue(staff);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer tok' },
    };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(auth.verifyHostelToken).toHaveBeenCalledWith('tok');
    expect(req.hostelUser).toBe(staff);
  });
});

describe('HostelInstituteAdminViewOnlyGuard', () => {
  const guard = new HostelInstituteAdminViewOnlyGuard();

  it('lets Institute Admin read', () => {
    expect(guard.canActivate(ctx({ hostelUser: admin, method: 'GET' }))).toBe(
      true,
    );
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'blocks Institute Admin %s on operational routes',
    (method) => {
      expect(() =>
        guard.canActivate(ctx({ hostelUser: admin, method })),
      ).toThrow(ForbiddenException);
    },
  );

  it('does not restrict assigned staff', () => {
    expect(guard.canActivate(ctx({ hostelUser: staff, method: 'POST' }))).toBe(
      true,
    );
  });
});

describe('HostelPermissionsGuard', () => {
  const getPermissionRules = jest.fn();
  const access = { getPermissionRules } as unknown as HostelAccessService;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new HostelPermissionsGuard(reflector, access);
  const need = (...reqs: { resource: string; action: string }[]) =>
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(reqs);

  beforeEach(() => jest.clearAllMocks());

  it('passes routes with no requirement', async () => {
    need();
    await expect(guard.canActivate(ctx({ hostelUser: staff }))).resolves.toBe(
      true,
    );
  });

  it('Institute Admin bypasses permission checks (write blocking is the view-only guard’s job)', async () => {
    need({ resource: 'gate_passes', action: 'read' });
    await expect(guard.canActivate(ctx({ hostelUser: admin }))).resolves.toBe(
      true,
    );
    expect(getPermissionRules).not.toHaveBeenCalled();
  });

  it('grants when the role holds the resource+action', async () => {
    need({ resource: 'gate_passes', action: 'scan' });
    getPermissionRules.mockResolvedValue({
      rules: [{ resource: 'gate_passes', actions: ['read', 'scan'] }],
      roleName: 'Gate Security',
    });
    await expect(guard.canActivate(ctx({ hostelUser: staff }))).resolves.toBe(
      true,
    );
  });

  it('denies (403) and names the missing permission', async () => {
    need({ resource: 'gate_passes', action: 'scan' });
    getPermissionRules.mockResolvedValue({
      rules: [{ resource: 'gate_passes', actions: ['read'] }],
      roleName: 'Clerk',
    });
    await expect(guard.canActivate(ctx({ hostelUser: staff }))).rejects.toThrow(
      /lacks required permission 'scan' on resource 'gate_passes'/,
    );
  });

  it('a user with no live assignment has no permissions', async () => {
    need({ resource: 'gate_passes', action: 'read' });
    getPermissionRules.mockResolvedValue({ rules: [], roleName: 'Unassigned' });
    await expect(guard.canActivate(ctx({ hostelUser: staff }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('requires EVERY listed permission when several are declared', async () => {
    need(
      { resource: 'attendance', action: 'mark' },
      { resource: 'residents', action: 'create' },
    );
    getPermissionRules.mockResolvedValue({
      rules: [{ resource: 'attendance', actions: ['mark'] }],
      roleName: 'Half',
    });
    await expect(guard.canActivate(ctx({ hostelUser: staff }))).rejects.toThrow(
      /'create' on resource 'residents'/,
    );
  });
});
