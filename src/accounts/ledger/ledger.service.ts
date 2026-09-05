import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountNature, BalanceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

function toSigned(amount: number, type: BalanceType): number {
  return type === BalanceType.DEBIT ? amount : -amount;
}

function fromSigned(signed: number): { amount: number; type: BalanceType } {
  return signed >= 0 ? { amount: Number(signed.toFixed(2)), type: BalanceType.DEBIT } : { amount: Number((-signed).toFixed(2)), type: BalanceType.CREDIT };
}

interface MovementRow {
  accountId: string;
  debit: string;
  credit: string;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sum of posted debit/credit movement per account, strictly before `beforeDate` (used as the opening carry-in for a report window). */
  private async movementsBefore(beforeDate: Date, instituteId?: string, accountIds?: string[]) {
    const rows = await this.prisma.$queryRawUnsafe<MovementRow[]>(
      `SELECT ve."accountId" as "accountId", COALESCE(SUM(ve."debitAmount"),0) as debit, COALESCE(SUM(ve."creditAmount"),0) as credit
       FROM voucher_entries ve
       INNER JOIN vouchers v ON v.id = ve."voucherId"
       WHERE v.status = 'POSTED' AND ve."voucherDate" < $1
       ${instituteId ? 'AND v."instituteId" = $2' : ''}
       ${accountIds && accountIds.length ? `AND ve."accountId" = ANY($${instituteId ? 3 : 2})` : ''}
       GROUP BY ve."accountId"`,
      ...[beforeDate, ...(instituteId ? [instituteId] : []), ...(accountIds && accountIds.length ? [accountIds] : [])],
    );
    return new Map(rows.map((r) => [r.accountId, { debit: Number(r.debit), credit: Number(r.credit) }]));
  }

  /** Sum of posted debit/credit movement per account within [from, to] inclusive. */
  private async movementsBetween(from: Date, to: Date, instituteId?: string, accountIds?: string[]) {
    const rows = await this.prisma.$queryRawUnsafe<MovementRow[]>(
      `SELECT ve."accountId" as "accountId", COALESCE(SUM(ve."debitAmount"),0) as debit, COALESCE(SUM(ve."creditAmount"),0) as credit
       FROM voucher_entries ve
       INNER JOIN vouchers v ON v.id = ve."voucherId"
       WHERE v.status = 'POSTED' AND ve."voucherDate" BETWEEN $1 AND $2
       ${instituteId ? 'AND v."instituteId" = $3' : ''}
       ${accountIds && accountIds.length ? `AND ve."accountId" = ANY($${instituteId ? 4 : 3})` : ''}
       GROUP BY ve."accountId"`,
      ...[from, to, ...(instituteId ? [instituteId] : []), ...(accountIds && accountIds.length ? [accountIds] : [])],
    );
    return new Map(rows.map((r) => [r.accountId, { debit: Number(r.debit), credit: Number(r.credit) }]));
  }

  async generalLedger(accountId: string, from: Date, to: Date, actor: AccountsPlatformUser) {
    const instituteId = actor.institute_id;
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, instituteId } });
    if (!account) throw new NotFoundException(`Ledger account ${accountId} not found`);

    const before = await this.movementsBefore(from, instituteId, [accountId]);
    const priorMovement = before.get(accountId) ?? { debit: 0, credit: 0 };
    let runningSigned = toSigned(Number(account.openingBalance), account.openingBalanceType) + priorMovement.debit - priorMovement.credit;
    const openingBalance = fromSigned(runningSigned);

    const entries = await this.prisma.voucherEntry.findMany({
      where: { accountId, voucherDate: { gte: from, lte: to }, voucher: { status: 'POSTED' } },
      include: { voucher: { select: { voucherNumber: true, voucherDate: true, narration: true, voucherType: { select: { name: true, code: true } } } } },
      orderBy: [{ voucherDate: 'asc' }, { createdAt: 'asc' }],
    });

    const rows = entries.map((e) => {
      runningSigned += Number(e.debitAmount) - Number(e.creditAmount);
      const balance = fromSigned(runningSigned);
      return {
        voucherDate: e.voucher.voucherDate,
        voucherNumber: e.voucher.voucherNumber,
        voucherType: e.voucher.voucherType.name,
        narration: e.narration || e.voucher.narration,
        debit: Number(e.debitAmount),
        credit: Number(e.creditAmount),
        runningBalance: balance.amount,
        runningBalanceType: balance.type,
      };
    });

    const closingBalance = fromSigned(runningSigned);
    return { account: { id: account.id, accountCode: account.accountCode, accountName: account.accountName }, openingBalance, closingBalance, entries: rows };
  }

  async dayBook(from: Date, to: Date, actor: AccountsPlatformUser) {
    return this.prisma.voucher.findMany({
      where: { status: 'POSTED', voucherDate: { gte: from, lte: to }, instituteId: actor.institute_id },
      include: { voucherType: true, entries: { include: { account: { select: { accountCode: true, accountName: true } } } } },
      orderBy: [{ voucherDate: 'asc' }, { voucherNumber: 'asc' }],
    });
  }

  private async cashOrBankBook(kind: 'isCashAccount' | 'isBankAccount', from: Date, to: Date, actor: AccountsPlatformUser) {
    const instituteId = actor.institute_id;
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { [kind]: true, instituteId } });
    if (accounts.length === 0) return { accounts: [], openingBalance: { amount: 0, type: BalanceType.DEBIT }, closingBalance: { amount: 0, type: BalanceType.DEBIT }, entries: [] };
    const accountIds = accounts.map((a) => a.id);

    const before = await this.movementsBefore(from, instituteId, accountIds);
    let runningSigned = accounts.reduce((sum, a) => {
      const m = before.get(a.id) ?? { debit: 0, credit: 0 };
      return sum + toSigned(Number(a.openingBalance), a.openingBalanceType) + m.debit - m.credit;
    }, 0);
    const openingBalance = fromSigned(runningSigned);

    const entries = await this.prisma.voucherEntry.findMany({
      where: { accountId: { in: accountIds }, voucherDate: { gte: from, lte: to }, voucher: { status: 'POSTED' } },
      include: { account: { select: { accountCode: true, accountName: true } }, voucher: { select: { voucherNumber: true, voucherDate: true, narration: true } } },
      orderBy: [{ voucherDate: 'asc' }, { createdAt: 'asc' }],
    });

    const rows = entries.map((e) => {
      runningSigned += Number(e.debitAmount) - Number(e.creditAmount);
      const balance = fromSigned(runningSigned);
      return {
        voucherDate: e.voucher.voucherDate,
        voucherNumber: e.voucher.voucherNumber,
        account: e.account.accountName,
        narration: e.narration || e.voucher.narration,
        debit: Number(e.debitAmount),
        credit: Number(e.creditAmount),
        runningBalance: balance.amount,
        runningBalanceType: balance.type,
      };
    });

    return {
      accounts: accounts.map((a) => ({ id: a.id, accountCode: a.accountCode, accountName: a.accountName })),
      openingBalance,
      closingBalance: fromSigned(runningSigned),
      entries: rows,
    };
  }

  cashBook(from: Date, to: Date, actor: AccountsPlatformUser) {
    return this.cashOrBankBook('isCashAccount', from, to, actor);
  }

  bankBook(from: Date, to: Date, actor: AccountsPlatformUser) {
    return this.cashOrBankBook('isBankAccount', from, to, actor);
  }

  async trialBalance(fyId: string, actor: AccountsPlatformUser) {
    const instituteId = actor.institute_id;
    const fy = await this.prisma.financialYear.findFirst({ where: { id: fyId, instituteId } });
    if (!fy) throw new NotFoundException(`Financial year ${fyId} not found`);

    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { instituteId },
      include: { group: { select: { groupName: true, nature: true } } },
      orderBy: { accountCode: 'asc' },
    });

    const movements = await this.movementsBetween(fy.startDate, fy.endDate, instituteId);
    const openings = await this.movementsBefore(fy.startDate, instituteId);

    let totalDebit = 0;
    let totalCredit = 0;
    const rows = accounts.map((a) => {
      const prior = openings.get(a.id) ?? { debit: 0, credit: 0 };
      const openingSigned = toSigned(Number(a.openingBalance), a.openingBalanceType) + prior.debit - prior.credit;
      const move = movements.get(a.id) ?? { debit: 0, credit: 0 };
      const closingSigned = openingSigned + move.debit - move.credit;
      const closing = fromSigned(closingSigned);
      if (closing.type === BalanceType.DEBIT) totalDebit += closing.amount;
      else totalCredit += closing.amount;

      return {
        accountId: a.id,
        accountCode: a.accountCode,
        accountName: a.accountName,
        groupName: a.group.groupName,
        nature: a.group.nature,
        debit: closing.type === BalanceType.DEBIT ? closing.amount : 0,
        credit: closing.type === BalanceType.CREDIT ? closing.amount : 0,
      };
    });

    return {
      fy: { id: fy.id, fyLabel: fy.fyLabel },
      rows,
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  async balanceSheet(asOf: Date, actor: AccountsPlatformUser) {
    const instituteId = actor.institute_id;
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { instituteId },
      include: { group: { select: { groupName: true, nature: true } } },
    });

    const movements = await this.movementsBetween(new Date(0), asOf, instituteId);

    let totalIncome = 0;
    let totalExpense = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];

    for (const a of accounts) {
      const move = movements.get(a.id) ?? { debit: 0, credit: 0 };
      const signed = toSigned(Number(a.openingBalance), a.openingBalanceType) + move.debit - move.credit;
      const balance = fromSigned(signed);
      const row = { accountId: a.id, accountCode: a.accountCode, accountName: a.accountName, amount: balance.amount, balanceType: balance.type };

      switch (a.group.nature) {
        case AccountNature.ASSET:
          assets.push(row);
          totalAssets += signed;
          break;
        case AccountNature.LIABILITY:
          liabilities.push(row);
          totalLiabilities += -signed;
          break;
        case AccountNature.EQUITY:
          equity.push(row);
          totalEquity += -signed;
          break;
        case AccountNature.INCOME:
          totalIncome += -signed;
          break;
        case AccountNature.EXPENSE:
          totalExpense += signed;
          break;
      }
    }

    const currentPeriodSurplus = Number((totalIncome - totalExpense).toFixed(2));

    return {
      asOf,
      assets,
      liabilities,
      equity,
      currentPeriodSurplus,
      totals: {
        assets: Number(totalAssets.toFixed(2)),
        liabilitiesAndEquity: Number((totalLiabilities + totalEquity + currentPeriodSurplus).toFixed(2)),
      },
    };
  }

  async incomeExpenditure(from: Date, to: Date, actor: AccountsPlatformUser) {
    const instituteId = actor.institute_id;
    if (to < from) throw new BadRequestException('`to` must not be before `from`');

    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { instituteId, group: { nature: { in: [AccountNature.INCOME, AccountNature.EXPENSE] } } },
      include: { group: { select: { groupName: true, nature: true } } },
    });
    const movements = await this.movementsBetween(from, to, instituteId, accounts.map((a) => a.id));

    const income: any[] = [];
    const expenditure: any[] = [];
    let totalIncome = 0;
    let totalExpenditure = 0;

    for (const a of accounts) {
      const move = movements.get(a.id) ?? { debit: 0, credit: 0 };
      if (a.group.nature === AccountNature.INCOME) {
        const amount = Number((move.credit - move.debit).toFixed(2));
        income.push({ accountId: a.id, accountCode: a.accountCode, accountName: a.accountName, amount });
        totalIncome += amount;
      } else {
        const amount = Number((move.debit - move.credit).toFixed(2));
        expenditure.push({ accountId: a.id, accountCode: a.accountCode, accountName: a.accountName, amount });
        totalExpenditure += amount;
      }
    }

    return {
      from,
      to,
      income,
      expenditure,
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpenditure: Number(totalExpenditure.toFixed(2)),
      surplusOrDeficit: Number((totalIncome - totalExpenditure).toFixed(2)),
    };
  }
}
