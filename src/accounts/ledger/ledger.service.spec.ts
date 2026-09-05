import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const actor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Test Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
};

describe('LedgerService', () => {
  let service: LedgerService;

  const mockPrisma = {
    ledgerAccount: { findFirst: jest.fn(), findMany: jest.fn() },
    voucherEntry: { findMany: jest.fn() },
    voucher: { findMany: jest.fn() },
    financialYear: { findFirst: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(LedgerService);
  });

  describe('generalLedger', () => {
    it('computes opening balance from the account plus prior movement, then a running balance per entry', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue({
        id: 'acc-cash',
        accountCode: 'CASH-001',
        accountName: 'Cash in Hand',
        openingBalance: 0,
        openingBalanceType: 'DEBIT',
      });
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]); // movementsBefore: nothing prior
      mockPrisma.voucherEntry.findMany.mockResolvedValue([
        {
          debitAmount: 100,
          creditAmount: 0,
          narration: null,
          voucher: { voucherNumber: 'RCT-00001', voucherDate: new Date('2026-09-03'), narration: 'Capital', voucherType: { name: 'Receipt Voucher', code: 'RECEIPT' } },
        },
      ]);

      const result = await service.generalLedger('acc-cash', new Date('2026-04-01'), new Date('2027-03-31'), actor);

      expect(result.openingBalance).toEqual({ amount: 0, type: 'DEBIT' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].runningBalance).toBe(100);
      expect(result.closingBalance).toEqual({ amount: 100, type: 'DEBIT' });
    });

    it('throws when the account does not exist in this institute', async () => {
      mockPrisma.ledgerAccount.findFirst.mockResolvedValue(null);
      await expect(service.generalLedger('missing', new Date(), new Date(), actor)).rejects.toThrow();
    });
  });

  describe('trialBalance', () => {
    it('reports isBalanced: true when every account nets to a valid double-entry state', async () => {
      mockPrisma.financialYear.findFirst.mockResolvedValue({ id: 'fy-1', fyLabel: '2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') });
      mockPrisma.ledgerAccount.findMany.mockResolvedValue([
        { id: 'acc-cash', accountCode: 'CASH-001', accountName: 'Cash', openingBalance: 0, openingBalanceType: 'DEBIT', group: { groupName: 'Current Assets', nature: 'ASSET' } },
        { id: 'acc-cap', accountCode: 'CAP-001', accountName: 'Capital', openingBalance: 0, openingBalanceType: 'DEBIT', group: { groupName: 'Capital', nature: 'EQUITY' } },
      ]);
      // movementsBetween (fy window) then movementsBefore (opening) — both via $queryRawUnsafe
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ accountId: 'acc-cash', debit: '10000', credit: '0' }, { accountId: 'acc-cap', debit: '0', credit: '10000' }])
        .mockResolvedValueOnce([]);

      const result = await service.trialBalance('fy-1', actor);

      expect(result.totalDebit).toBe(10000);
      expect(result.totalCredit).toBe(10000);
      expect(result.isBalanced).toBe(true);
    });

    it('throws when the financial year does not exist in this institute', async () => {
      mockPrisma.financialYear.findFirst.mockResolvedValue(null);
      await expect(service.trialBalance('missing-fy', actor)).rejects.toThrow();
    });
  });

  describe('balanceSheet', () => {
    it('satisfies Assets = Liabilities + Equity and reports isBalanced: true', async () => {
      mockPrisma.ledgerAccount.findMany.mockResolvedValue([
        { id: 'acc-cash', accountCode: 'CASH-001', accountName: 'Cash', openingBalance: 0, openingBalanceType: 'DEBIT', group: { groupName: 'Current Assets', nature: 'ASSET' } },
        { id: 'acc-ap', accountCode: 'AP-001', accountName: 'Accounts Payable', openingBalance: 0, openingBalanceType: 'DEBIT', group: { groupName: 'Current Liabilities', nature: 'LIABILITY' } },
        { id: 'acc-cap', accountCode: 'CAP-001', accountName: 'Capital', openingBalance: 0, openingBalanceType: 'DEBIT', group: { groupName: 'Capital', nature: 'EQUITY' } },
      ]);
      // Cash 1000 Dr, funded by 400 borrowed (AP, credit-natured) + 600 capital (Equity, credit-natured)
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { accountId: 'acc-cash', debit: '1000', credit: '0' },
        { accountId: 'acc-ap', debit: '0', credit: '400' },
        { accountId: 'acc-cap', debit: '0', credit: '600' },
      ]);

      const result = await service.balanceSheet(new Date('2026-09-03'), actor);

      expect(result.totals.assets).toBe(1000);
      expect(result.totals.liabilitiesAndEquity).toBe(1000);
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('incomeExpenditure', () => {
    it('rejects a `to` date before `from`', async () => {
      await expect(service.incomeExpenditure(new Date('2026-09-03'), new Date('2026-01-01'), actor)).rejects.toThrow(BadRequestException);
    });

    it('computes surplus as total income minus total expenditure for the period', async () => {
      mockPrisma.ledgerAccount.findMany.mockResolvedValue([
        { id: 'acc-inc', accountCode: 'INC-001', accountName: 'Sales Income', group: { groupName: 'Income', nature: 'INCOME' } },
        { id: 'acc-exp', accountCode: 'EXP-001', accountName: 'Office Expenses', group: { groupName: 'Indirect Expenses', nature: 'EXPENSE' } },
      ]);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { accountId: 'acc-inc', debit: '0', credit: '500' },
        { accountId: 'acc-exp', debit: '200', credit: '0' },
      ]);

      const result = await service.incomeExpenditure(new Date('2026-04-01'), new Date('2027-03-31'), actor);

      expect(result.totalIncome).toBe(500);
      expect(result.totalExpenditure).toBe(200);
      expect(result.surplusOrDeficit).toBe(300);
    });
  });

  describe('dayBook', () => {
    it('scopes posted vouchers to this institute and the given date range', async () => {
      mockPrisma.voucher.findMany.mockResolvedValue([{ id: 'v-1', voucherNumber: 'JRN-00001' }]);
      const result = await service.dayBook(new Date('2026-09-03'), new Date('2026-09-03'), actor);
      expect(mockPrisma.voucher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'POSTED', instituteId: 'inst-1' }) }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('cashBook / bankBook', () => {
    it('returns a zeroed report when no accounts are flagged as cash accounts', async () => {
      mockPrisma.ledgerAccount.findMany.mockResolvedValue([]);
      const result = await service.cashBook(new Date('2026-04-01'), new Date('2027-03-31'), actor);
      expect(result.accounts).toEqual([]);
      expect(result.openingBalance).toEqual({ amount: 0, type: 'DEBIT' });
    });

    it('sums opening balances across every account flagged as a bank account', async () => {
      mockPrisma.ledgerAccount.findMany.mockResolvedValue([{ id: 'acc-bank', accountCode: 'BANK-001', accountName: 'Bank', openingBalance: 500, openingBalanceType: 'DEBIT' }]);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]); // movementsBefore
      mockPrisma.voucherEntry.findMany.mockResolvedValue([]);

      const result = await service.bankBook(new Date('2026-04-01'), new Date('2027-03-31'), actor);
      expect(result.openingBalance).toEqual({ amount: 500, type: 'DEBIT' });
    });
  });
});
