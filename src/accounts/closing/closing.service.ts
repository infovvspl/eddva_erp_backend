import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BalanceType, FinancialYearStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

function toSigned(amount: number, type: BalanceType): number {
  return type === BalanceType.DEBIT ? amount : -amount;
}

function fromSigned(signed: number): { amount: number; type: BalanceType } {
  return signed >= 0 ? { amount: Number(signed.toFixed(2)), type: BalanceType.DEBIT } : { amount: Number((-signed).toFixed(2)), type: BalanceType.CREDIT };
}

@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  /**
   * Opening balance for `accountId` as of the start of `fy`: the immediately
   * preceding financial year's closing snapshot if one exists, otherwise the
   * ledger account's own lifetime opening balance. This is how "carry forward"
   * is satisfied without duplicating any transactional data (section 6/25).
   */
  async getOpeningBalanceForFy(accountId: string, fy: { id: string; startDate: Date; instituteId: string | null }) {
    const priorFy = await this.prisma.financialYear.findFirst({
      where: { instituteId: fy.instituteId, endDate: { lt: fy.startDate } },
      orderBy: { endDate: 'desc' },
    });

    if (priorFy) {
      const priorBalance = await this.prisma.accountPeriodBalance.findUnique({
        where: { fyId_accountId: { fyId: priorFy.id, accountId } },
      });
      if (priorBalance) {
        return { amount: Number(priorBalance.closingBalance), type: priorBalance.closingBalanceType };
      }
    }

    const account = await this.prisma.ledgerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Ledger account ${accountId} not found`);
    return { amount: Number(account.openingBalance), type: account.openingBalanceType };
  }

  async closeFinancialYear(fyId: string, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const fy = await this.prisma.financialYear.findFirst({ where: { id: fyId, instituteId } });
    if (!fy) throw new NotFoundException(`Financial year ${fyId} not found`);
    if (fy.status === FinancialYearStatus.CLOSED) {
      throw new ConflictException(`Financial year "${fy.fyLabel}" is already closed`);
    }

    const accounts = await this.prisma.ledgerAccount.findMany({ where: { instituteId }, select: { id: true } });

    const movements = await this.prisma.$queryRaw<Array<{ accountId: string; totalDebit: string; totalCredit: string }>>`
      SELECT ve."accountId" as "accountId",
             COALESCE(SUM(ve."debitAmount"), 0) as "totalDebit",
             COALESCE(SUM(ve."creditAmount"), 0) as "totalCredit"
      FROM "voucher_entries" ve
      INNER JOIN "vouchers" v ON v.id = ve."voucherId"
      WHERE v."fyId" = ${fyId} AND v."status" = 'POSTED'
      GROUP BY ve."accountId"
    `;
    const movementByAccount = new Map(movements.map((m) => [m.accountId, { debit: Number(m.totalDebit), credit: Number(m.totalCredit) }]));

    const result = await this.prisma.$transaction(async (tx) => {
      let processed = 0;
      for (const { id: accountId } of accounts) {
        const opening = await this.getOpeningBalanceForFy(accountId, fy);
        const move = movementByAccount.get(accountId) ?? { debit: 0, credit: 0 };
        const closingSigned = toSigned(opening.amount, opening.type) + move.debit - move.credit;
        const closing = fromSigned(closingSigned);

        await tx.accountPeriodBalance.upsert({
          where: { fyId_accountId: { fyId, accountId } },
          create: {
            fyId,
            accountId,
            openingBalance: opening.amount,
            openingBalanceType: opening.type,
            closingBalance: closing.amount,
            closingBalanceType: closing.type,
          },
          update: {
            openingBalance: opening.amount,
            openingBalanceType: opening.type,
            closingBalance: closing.amount,
            closingBalanceType: closing.type,
          },
        });
        processed++;
      }

      const closedFy = await tx.financialYear.update({
        where: { id: fyId },
        data: { status: FinancialYearStatus.CLOSED, closedAt: new Date(), closedBy: userId },
      });

      return { closedFy, accountsClosed: processed };
    });

    await this.auditService.log({
      userId,
      entityType: ACCOUNTS_ENTITY.FINANCIAL_YEAR,
      entityId: fyId,
      action: 'CLOSE',
      oldStatus: FinancialYearStatus.OPEN,
      newStatus: FinancialYearStatus.CLOSED,
      metadata: { accountsClosed: result.accountsClosed },
    });

    return result;
  }
}
