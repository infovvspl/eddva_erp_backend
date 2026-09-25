import { AccountsDynamicRolesService } from './accounts-dynamic-roles.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const actor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
  role_id: 7,
};

describe('AccountsDynamicRolesService.getMyPermissions', () => {
  const mockPrisma = { accountsUserDynamicRole: { findUnique: jest.fn() } };
  const mockPermissions = {
    listPermissions: jest.fn().mockResolvedValue({
      resources: [{ resource: 'vouchers', available_actions: ['read', 'create'] }],
    }),
  };
  const mockAccess = { getPermissionRules: jest.fn() };
  const service = new AccountsDynamicRolesService(mockPrisma as any, mockPermissions as any, mockAccess as any);

  beforeEach(() => jest.clearAllMocks());

  it('reports the same matrix the permissions guard enforces (resolved via the shared access service)', async () => {
    const rules = [{ resource: 'vouchers', actions: ['read'] }];
    mockAccess.getPermissionRules.mockResolvedValue({ rules, roleName: 'Accountant' });

    await expect(service.getMyPermissions(actor)).resolves.toEqual(rules);
    expect(mockAccess.getPermissionRules).toHaveBeenCalledWith(actor);
  });

  it('no longer bypasses the role_id claim by reading only the user assignment row', async () => {
    mockAccess.getPermissionRules.mockResolvedValue({ rules: [], roleName: 'Accountant' });
    await service.getMyPermissions(actor);
    expect(mockPrisma.accountsUserDynamicRole.findUnique).not.toHaveBeenCalled();
  });

  it('gives an institute admin the full catalogue', async () => {
    const admin = { ...actor, user_role: 'INSTITUTE_ADMIN', is_institute_admin: true };
    await expect(service.getMyPermissions(admin)).resolves.toEqual([{ resource: 'vouchers', actions: ['read', 'create'] }]);
    expect(mockAccess.getPermissionRules).not.toHaveBeenCalled();
  });
});
