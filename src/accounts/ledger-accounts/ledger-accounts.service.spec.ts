import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LedgerAccountsService } from './ledger-accounts.service';
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

describe('LedgerAccountsService', () => {
  let service: LedgerAccountsService;

  const mockPrisma = {
    accountGroup: { findFirst: jest.fn() },
    ledgerAccount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LedgerAccountsService, { provide: PrismaService, useValue: mockPrisma }, { provide: AccountsAuditService, useValue: mockAudit }],
    }).compile();
    service = module.get(LedgerAccountsService);
  });

  it('creates a leaf ledger account under an existing group', async () => {
    mockPrisma.accountGroup.findFirst.mockResolvedValue({ id: 'g-1' });
    mockPrisma.ledgerAccount.findFirst.mockResolvedValue(null);
    mockPrisma.ledgerAccount.create.mockResolvedValue({ id: 'a-1', accountCode: 'CASH-001' });

    const result = await service.create({ accountCode: 'CASH-001', accountName: 'Cash', groupId: 'g-1' } as any, actor);
    expect(result.accountCode).toBe('CASH-001');
  });

  it('rejects when the account group does not exist', async () => {
    mockPrisma.accountGroup.findFirst.mockResolvedValue(null);
    await expect(service.create({ accountCode: 'X', accountName: 'X', groupId: 'missing' } as any, actor)).rejects.toThrow(NotFoundException);
  });

  it('rejects a duplicate account code', async () => {
    mockPrisma.accountGroup.findFirst.mockResolvedValue({ id: 'g-1' });
    mockPrisma.ledgerAccount.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.create({ accountCode: 'CASH-001', accountName: 'Cash', groupId: 'g-1' } as any, actor)).rejects.toThrow(ConflictException);
  });

  describe('assertPostable (Rules 2 & 5)', () => {
    it('rejects an inactive account', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue({ id: 'a-1', accountName: 'Cash', isActive: false, allowVoucherEntry: true });
      await expect(service.assertPostable('a-1', 'inst-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a structural (non-leaf) account', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue({ id: 'a-1', accountName: 'Cash', isActive: true, allowVoucherEntry: false });
      await expect(service.assertPostable('a-1', 'inst-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-existent account', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue(null);
      await expect(service.assertPostable('missing', 'inst-1')).rejects.toThrow(NotFoundException);
    });

    it('allows an active, postable leaf account', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue({ id: 'a-1', accountName: 'Cash', isActive: true, allowVoucherEntry: true });
      await expect(service.assertPostable('a-1', 'inst-1')).resolves.toBeDefined();
    });

    it('always scopes the lookup to the given institute', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue({ id: 'a-1', accountName: 'Cash', isActive: true, allowVoucherEntry: true });
      await service.assertPostable('a-1', 'inst-1');
      expect(mockPrisma.ledgerAccount.findFirst).toHaveBeenCalledWith({ where: { id: 'a-1', instituteId: 'inst-1' } });
    });

    it('fails closed when no institute is supplied instead of searching every tenant', async () => {
      mockPrisma.ledgerAccount.findFirst.mockClear();
      await expect(service.assertPostable('a-1', '')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.ledgerAccount.findFirst).not.toHaveBeenCalled();
    });
  });
});
