import { Injectable } from '@nestjs/common';
import { BalanceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

const LIST_SIZE = 6;

function toSigned(amount: number, type: BalanceType): number {
  return type === BalanceType.DEBIT ? amount : -amount;
}

export interface AccountsDashboardSummary {
  open_financial_year: string | null;
  totals: {
    draft_vouchers: number;
    posted_this_month: number;
    cancelled_this_month: number;
    cash_balance: number;
    bank_balance: number;
  };
  recent_vouchers: Array<{
    voucher_id: string;
    voucher_number: string;
    voucher_date: Date;
    narration: string | null;
    total_amount: number;
    status: string;
  }>;
}

@Injectable()
export class AccountsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Net signed balance (opening + all posted movement) for the given cash/bank accounts, as of now. */
  private async netBalance(instituteId: string, kind: 'isCashAccount' | 'isBankAccount'): Promise<number> {
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { instituteId, [kind]: true },
      select: { id: true, openingBalance: true, openingBalanceType: true },
    });
    if (accounts.length === 0) return 0;

    const movements = await this.prisma.voucherEntry.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map((a) => a.id) }, voucher: { status: 'POSTED' } },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const movementMap = new Map(movements.map((m) => [m.accountId, m]));

    return accounts.reduce((sum, a) => {
      const move = movementMap.get(a.id);
      const debit = Number(move?._sum.debitAmount ?? 0);
      const credit = Number(move?._sum.creditAmount ?? 0);
      return sum + toSigned(Number(a.openingBalance), a.openingBalanceType) + debit - credit;
    }, 0);
  }

  /** Every figure is limited to the caller's institute. */
  async getSummary(instituteId: string): Promise<AccountsDashboardSummary> {
    const instId = requireInstituteId(instituteId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [openFy, draftVouchers, postedThisMonth, cancelledThisMonth, cashBalance, bankBalance, recentVouchers] = await Promise.all([
      this.prisma.financialYear.findFirst({ where: { instituteId: instId, status: 'OPEN' }, select: { fyLabel: true } }),
      this.prisma.voucher.count({ where: { instituteId: instId, status: 'DRAFT' } }),
      this.prisma.voucher.count({ where: { instituteId: instId, status: 'POSTED', postedAt: { gte: monthStart } } }),
      this.prisma.voucher.count({ where: { instituteId: instId, status: 'CANCELLED', cancelledAt: { gte: monthStart } } }),
      this.netBalance(instId, 'isCashAccount'),
      this.netBalance(instId, 'isBankAccount'),
      this.prisma.voucher.findMany({
        where: { instituteId: instId },
        orderBy: { createdAt: 'desc' },
        take: LIST_SIZE,
        select: { id: true, voucherNumber: true, voucherDate: true, narration: true, totalDebit: true, status: true },
      }),
    ]);

    return {
      open_financial_year: openFy?.fyLabel ?? null,
      totals: {
        draft_vouchers: draftVouchers,
        posted_this_month: postedThisMonth,
        cancelled_this_month: cancelledThisMonth,
        cash_balance: Math.round(cashBalance * 100) / 100,
        bank_balance: Math.round(bankBalance * 100) / 100,
      },
      recent_vouchers: recentVouchers.map((v) => ({
        voucher_id: v.id,
        voucher_number: v.voucherNumber,
        voucher_date: v.voucherDate,
        narration: v.narration,
        total_amount: Number(v.totalDebit),
        status: v.status,
      })),
    };
  }
}
