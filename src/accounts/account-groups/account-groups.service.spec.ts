import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountGroupsService } from './account-groups.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const actor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Test Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
};

describe('AccountGroupsService', () => {
  let service: AccountGroupsService;

  const mockPrisma = {
    accountGroup: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountGroupsService, { provide: PrismaService, useValue: mockPrisma }, { provide: AccountsAuditService, useValue: mockAudit }],
    }).compile();
    service = module.get(AccountGroupsService);
  });

  it('creates a top-level account group', async () => {
    mockPrisma.accountGroup.findFirst.mockResolvedValue(null);
    mockPrisma.accountGroup.create.mockResolvedValue({ id: 'g-1', groupName: 'Current Assets', nature: 'ASSET' });

    const result = await service.create({ groupName: 'Current Assets', nature: 'ASSET' } as any, actor);
    expect(result.groupName).toBe('Current Assets');
    expect(mockAudit.log).toHaveBeenCalled();
  });

  it('creates a nested sub-group under an existing parent', async () => {
    mockPrisma.accountGroup.findFirst
      .mockResolvedValueOnce({ id: 'parent-1' }) // assertParentExists
      .mockResolvedValueOnce(null); // duplicate-name check
    mockPrisma.accountGroup.create.mockResolvedValue({ id: 'g-2', groupName: 'Cash-in-hand', parentGroupId: 'parent-1', nature: 'ASSET' });

    const result = await service.create({ groupName: 'Cash-in-hand', parentGroupId: 'parent-1', nature: 'ASSET' } as any, actor);
    expect(result.parentGroupId).toBe('parent-1');
  });

  it('rejects creating a group under a non-existent parent', async () => {
    mockPrisma.accountGroup.findFirst.mockResolvedValue(null);
    await expect(service.create({ groupName: 'X', parentGroupId: 'missing', nature: 'ASSET' } as any, actor)).rejects.toThrow(NotFoundException);
  });

  it('rejects a duplicate group name', async () => {
    mockPrisma.accountGroup.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.create({ groupName: 'Current Assets', nature: 'ASSET' } as any, actor)).rejects.toThrow(ConflictException);
  });

  it('rejects re-parenting a group under its own descendant (cycle prevention)', async () => {
    // existing group being updated
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'g-1', groupName: 'A', ledgerAccounts: [] } as any);
    // walk-up chain: candidateParent 'g-2' -> parent 'g-1' (the group itself) => cycle
    mockPrisma.accountGroup.findFirst.mockResolvedValueOnce({ id: 'g-2' }); // assertParentExists
    mockPrisma.accountGroup.findUnique.mockResolvedValueOnce({ parentGroupId: 'g-1' });

    await expect(service.update('g-1', { parentGroupId: 'g-2' } as any, actor)).rejects.toThrow(ConflictException);
  });
});
