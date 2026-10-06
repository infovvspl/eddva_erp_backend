import { ForbiddenException } from '@nestjs/common';
import { AccountsPermissionsRegistryController } from './accounts-permissions-registry.controller';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const clerk: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Clerk',
  user_role: 'CLERK',
  is_institute_admin: false,
};
const admin: AccountsPlatformUser = { ...clerk, user_role: 'INSTITUTE_ADMIN', is_institute_admin: true };

describe('AccountsPermissionsRegistryController — access control', () => {
  const svc = {
    listPermissions: jest.fn().mockResolvedValue({ total: 0 }),
    getPermission: jest.fn().mockResolvedValue({}),
    createPermission: jest.fn().mockResolvedValue({}),
    updatePermission: jest.fn().mockResolvedValue({}),
    deletePermission: jest.fn().mockResolvedValue({}),
  };
  const controller = new AccountsPermissionsRegistryController(svc as any);

  beforeEach(() => jest.clearAllMocks());

  const calls: Array<[string, (user: AccountsPlatformUser) => unknown]> = [
    ['list', (u) => controller.listPermissions(u)],
    ['get', (u) => controller.getPermission(u, 1)],
    ['create', (u) => controller.createPermission(u, { resource: 'x', action: 'y' } as any)],
    ['update', (u) => controller.updatePermission(u, 1, { is_active: false } as any)],
    ['delete', (u) => controller.deletePermission(u, 1)],
  ];

  it.each(calls)('rejects a non-admin Accounts user on %s and never reaches the service', (_name, call) => {
    expect(() => call(clerk)).toThrow(ForbiddenException);
    Object.values(svc).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it.each(calls)('lets an institute admin through on %s', (_name, call) => {
    expect(() => call(admin)).not.toThrow();
  });
});
