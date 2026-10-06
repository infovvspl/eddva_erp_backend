import { AccountsAccessService } from './accounts-access.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const baseActor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
};

describe('AccountsAccessService', () => {
  const mockPrisma = {
    accountsDynamicRole: { findUnique: jest.fn() },
    accountsUserDynamicRole: { findFirst: jest.fn() },
    accountsPermission: { findMany: jest.fn() },
  };
  const service = new AccountsAccessService(mockPrisma as any);

  const voucherRole = {
    name: 'Accountant',
    permissions: [
      { resource: 'vouchers', actions: ['read', 'create', 'post'] },
      { resource: 'reports', actions: ['read'] },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.accountsPermission.findMany.mockResolvedValue([]);
  });

  it('resolves rules from the role_id claim when present', async () => {
    mockPrisma.accountsDynamicRole.findUnique.mockResolvedValue(voucherRole);
    const { rules, roleName } = await service.getPermissionRules({ ...baseActor, role_id: 7 });
    expect(mockPrisma.accountsDynamicRole.findUnique).toHaveBeenCalledWith({ where: { role_id: 7 } });
    expect(roleName).toBe('Accountant');
    expect(rules).toHaveLength(2);
  });

  it('falls back to the user\'s role assignment when there is no role_id claim', async () => {
    mockPrisma.accountsUserDynamicRole.findFirst.mockResolvedValue({ role: voucherRole });
    const { rules } = await service.getPermissionRules(baseActor);
    expect(rules.some((r) => r.resource === 'vouchers')).toBe(true);
  });

  it('removes actions whose catalogue permission has been deactivated', async () => {
    mockPrisma.accountsDynamicRole.findUnique.mockResolvedValue(voucherRole);
    mockPrisma.accountsPermission.findMany.mockResolvedValue([{ key: 'vouchers:post' }]);

    const actor = { ...baseActor, role_id: 7 };
    const { rules } = await service.getPermissionRules(actor);

    const vouchers = rules.find((r) => r.resource === 'vouchers');
    expect(vouchers?.actions).toEqual(['read', 'create']);
    await expect(service.hasPermission(actor, 'vouchers', 'post')).resolves.toBe(false);
    await expect(service.hasPermission(actor, 'vouchers', 'create')).resolves.toBe(true);
  });

  it('leaves active permissions untouched when nothing is deactivated', async () => {
    mockPrisma.accountsDynamicRole.findUnique.mockResolvedValue(voucherRole);
    const { rules } = await service.getPermissionRules({ ...baseActor, role_id: 7 });
    expect(rules.find((r) => r.resource === 'vouchers')?.actions).toEqual(['read', 'create', 'post']);
  });
});
