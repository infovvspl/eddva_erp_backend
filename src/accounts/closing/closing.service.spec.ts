import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ClosingService } from './closing.service';
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

describe('ClosingService', () => {
  let service: ClosingService;

  const mockTx = {
    accountPeriodBalance: { upsert: jest.fn() },
    financialYear: { update: jest.fn() },
  };
  const mockPrisma = {
    financialYear: { findFirst: jest.fn() },
    ledgerAccount: { findMany: jest.fn(), findUnique: jest.fn() },
    accountPeriodBalance: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((cb: any) => cb(mockTx)),
  };
  const mockAudit = { log: jest.fn() };

  const openFy = { id: 'fy-1', fyLabel: '2026-27', status: 'OPEN', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), instituteId: 'inst-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction = jest.fn((cb: any) => cb(mockTx));
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClosingService, { provide: PrismaService, useValue: mockPrisma }, { provide: AccountsAuditService, useValue: mockAudit }],
    }).compile();
    service = module.get(ClosingService);
  });

  it('rejects closing a financial year that is already closed', async () => {
    mockPrisma.financialYear.findFirst.mockResolvedValue({ ...openFy, status: 'CLOSED' });
    await expect(service.closeFinancialYear('fy-1', actor)).rejects.toThrow(ConflictException);
  });

  it('snapshots a closing balance per account and freezes the financial year (first-ever FY: opening comes from the ledger account itself)', async () => {
    // Real double-entry data always nets to zero across accounts — acc-cash's 10000 debit
    // is funded by acc-cap's 10000 credit, mirroring the capital-introduced example used
    // in this module's own live verification.
    mockPrisma.financialYear.findFirst.mockResolvedValueOnce(openFy).mockResolvedValue(null); // FY being closed, then "no prior FY" for every account's opening lookup
    mockPrisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'acc-cash' }, { id: 'acc-cap' }]);
    mockPrisma.ledgerAccount.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: where.id, openingBalance: 0, openingBalanceType: 'DEBIT' }),
    );
    mockPrisma.$queryRaw.mockResolvedValue([
      { accountId: 'acc-cash', totalDebit: '10000', totalCredit: '0' },
      { accountId: 'acc-cap', totalDebit: '0', totalCredit: '10000' },
    ]);
    mockTx.accountPeriodBalance.upsert.mockResolvedValue({});
    mockTx.financialYear.update.mockResolvedValue({ id: 'fy-1', status: 'CLOSED' });

    const result = await service.closeFinancialYear('fy-1', actor);

    expect(result.accountsClosed).toBe(2);
    expect(mockTx.accountPeriodBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fyId_accountId: { fyId: 'fy-1', accountId: 'acc-cash' } },
        create: expect.objectContaining({ openingBalance: 0, closingBalance: 10000, closingBalanceType: 'DEBIT' }),
      }),
    );
    expect(mockTx.financialYear.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fy-1' }, data: expect.objectContaining({ status: 'CLOSED', closedBy: 'user-1' }) }),
    );
  });

  it('carries the prior financial year\'s closing balance forward as the new opening balance, instead of the ledger account\'s lifetime opening', async () => {
    const priorFy = { id: 'fy-0', endDate: new Date('2026-03-31') };
    mockPrisma.financialYear.findFirst.mockResolvedValueOnce(openFy).mockResolvedValue(priorFy); // FY being closed, then "prior FY exists" for every account's opening lookup
    mockPrisma.accountPeriodBalance.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.fyId_accountId.accountId === 'acc-cash' ? { closingBalance: 5000, closingBalanceType: 'DEBIT' } : { closingBalance: 5000, closingBalanceType: 'CREDIT' },
      ),
    );
    mockPrisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'acc-cash' }, { id: 'acc-cap' }]);
    mockPrisma.$queryRaw.mockResolvedValue([]); // no movement this year
    mockTx.accountPeriodBalance.upsert.mockResolvedValue({});
    mockTx.financialYear.update.mockResolvedValue({ id: 'fy-1', status: 'CLOSED' });

    await service.closeFinancialYear('fy-1', actor);

    expect(mockPrisma.ledgerAccount.findUnique).not.toHaveBeenCalled();
    expect(mockTx.accountPeriodBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fyId_accountId: { fyId: 'fy-1', accountId: 'acc-cash' } },
        create: expect.objectContaining({ openingBalance: 5000, openingBalanceType: 'DEBIT', closingBalance: 5000, closingBalanceType: 'DEBIT' }),
      }),
    );
  });

  it('aborts and never marks the year closed if the computed closing balances do not net to zero (accounting integrity check)', async () => {
    mockPrisma.financialYear.findFirst.mockResolvedValueOnce(openFy).mockResolvedValue(null); // FY being closed, then "no prior FY" for every account's opening lookup
    mockPrisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'acc-a' }, { id: 'acc-b' }]);
    mockPrisma.ledgerAccount.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: where.id, openingBalance: 0, openingBalanceType: 'DEBIT' }),
    );
    // acc-a closes DEBIT 100, acc-b closes CREDIT 50 — deliberately mismatched, should never happen from real posted data
    mockPrisma.$queryRaw.mockResolvedValue([
      { accountId: 'acc-a', totalDebit: '100', totalCredit: '0' },
      { accountId: 'acc-b', totalDebit: '0', totalCredit: '50' },
    ]);
    mockTx.accountPeriodBalance.upsert.mockResolvedValue({});

    await expect(service.closeFinancialYear('fy-1', actor)).rejects.toThrow(InternalServerErrorException);
    expect(mockTx.financialYear.update).not.toHaveBeenCalled();
  });
});
