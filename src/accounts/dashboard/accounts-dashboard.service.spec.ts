import { ForbiddenException } from '@nestjs/common';
import { AccountsDashboardService } from './accounts-dashboard.service';

function makePrisma() {
  return {
    financialYear: { findFirst: jest.fn().mockResolvedValue({ fyLabel: '2026-27' }) },
    voucher: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ledgerAccount: { findMany: jest.fn().mockResolvedValue([]) },
    voucherEntry: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}

describe('AccountsDashboardService', () => {
  it('scopes every query to the caller\'s institute', async () => {
    const prisma = makePrisma();
    await new AccountsDashboardService(prisma as any).getSummary('inst-a');

    expect(prisma.financialYear.findFirst.mock.calls[0][0].where.instituteId).toBe('inst-a');
    for (const call of prisma.voucher.count.mock.calls) {
      expect(call[0].where.instituteId).toBe('inst-a');
    }
    expect(prisma.voucher.findMany.mock.calls[0][0].where.instituteId).toBe('inst-a');
  });

  it('computes cash/bank balance from opening balance plus posted movement only', async () => {
    const prisma = makePrisma();
    prisma.ledgerAccount.findMany.mockImplementation(async ({ where }: any) =>
      where.isCashAccount ? [{ id: 'cash1', openingBalance: 1000, openingBalanceType: 'DEBIT' }] : [],
    );
    prisma.voucherEntry.groupBy.mockResolvedValue([{ accountId: 'cash1', _sum: { debitAmount: 200, creditAmount: 50 } }]);

    const summary = await new AccountsDashboardService(prisma as any).getSummary('inst-a');

    // 1000 opening (debit) + 200 debit - 50 credit = 1150
    expect(summary.totals.cash_balance).toBe(1150);
    expect(summary.totals.bank_balance).toBe(0);
    expect(summary.open_financial_year).toBe('2026-27');
  });

  it('shapes the recent vouchers list', async () => {
    const prisma = makePrisma();
    prisma.voucher.findMany.mockResolvedValue([
      { id: 'v1', voucherNumber: 'PV/2026-27/00001', voucherDate: new Date('2026-09-01'), narration: 'Rent', totalDebit: 5000, status: 'POSTED' },
    ]);
    const summary = await new AccountsDashboardService(prisma as any).getSummary('inst-a');
    expect(summary.recent_vouchers[0]).toMatchObject({ voucher_number: 'PV/2026-27/00001', narration: 'Rent', total_amount: 5000, status: 'POSTED' });
  });

  it('refuses a session with no institute', async () => {
    const prisma = makePrisma();
    await expect(new AccountsDashboardService(prisma as any).getSummary('')).rejects.toThrow(ForbiddenException);
    expect(prisma.voucher.count).not.toHaveBeenCalled();
  });
});
