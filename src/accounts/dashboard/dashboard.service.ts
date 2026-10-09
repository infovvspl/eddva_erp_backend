import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

/**
 * Reuses LedgerService.cashBook/bankBook for the cash-and-bank balances
 * rather than reimplementing the debit/credit sign convention here — that
 * logic (opening balance type, running balance) is already correct and
 * tested there. Trial-balance imbalance is still excluded (see v1 comment):
 * LedgerService.trialBalance() recomputes every voucher entry for the whole
 * financial year and is too expensive for a landing-page KPI.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async getSummary(actor: AccountsPlatformUser, from?: string, to?: string) {
    const instituteId = actor.institute_id;
    const instituteWhere = instituteId ? { instituteId } : {};
    const voucherDateRange =
      from || to
        ? { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) }
        : undefined;

    const [openFinancialYear, activeLedgerAccounts, activeCostCenters, draftVouchers, byStatus, byTypeRaw] =
      await Promise.all([
        this.prisma.financialYear.findFirst({
          where: { ...instituteWhere, status: 'OPEN' },
          select: { id: true, fyLabel: true, startDate: true, endDate: true },
        }),
        this.prisma.ledgerAccount.count({ where: { ...instituteWhere, isActive: true } }),
        this.prisma.costCenter.count({ where: { ...instituteWhere, isActive: true } }),
        this.prisma.voucher.count({ where: { ...instituteWhere, status: 'DRAFT' } }),
        this.prisma.voucher.groupBy({
          by: ['status'],
          where: { ...instituteWhere, voucherDate: voucherDateRange },
          _count: { _all: true },
        }),
        this.prisma.voucher.groupBy({
          by: ['voucherTypeId'],
          where: { ...instituteWhere, status: 'POSTED', voucherDate: voucherDateRange },
          _count: { _all: true },
          _sum: { totalDebit: true },
        }),
      ]);

    const voucherTypes = await this.prisma.voucherType.findMany({
      where: { id: { in: byTypeRaw.map((r) => r.voucherTypeId) } },
      select: { id: true, name: true },
    });
    const typeMap = new Map(voucherTypes.map((t) => [t.id, t.name]));

    let cashAndBank: { cash: any; bank: any } | null = null;
    if (openFinancialYear) {
      const bookFrom = openFinancialYear.startDate;
      const bookTo = to ? new Date(to) : new Date();
      const [cash, bank] = await Promise.all([
        this.ledger.cashBook(bookFrom, bookTo, actor),
        this.ledger.bankBook(bookFrom, bookTo, actor),
      ]);
      cashAndBank = {
        cash: { accounts: cash.accounts, balance: cash.closingBalance },
        bank: { accounts: bank.accounts, balance: bank.closingBalance },
      };
    }

    return {
      range: { from: from ?? null, to: to ?? null },
      overview: {
        active_ledger_accounts: activeLedgerAccounts,
        active_cost_centers: activeCostCenters,
        open_financial_year: openFinancialYear,
      },
      vouchers: {
        draft_pending: draftVouchers,
        by_status: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
        by_type: byTypeRaw.map((r) => ({
          voucher_type: typeMap.get(r.voucherTypeId) ?? 'Unknown',
          count: r._count._all,
          total_debit: Number(r._sum.totalDebit ?? 0),
        })),
      },
      cash_and_bank: cashAndBank,
    };
  }
}
