import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VoucherStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { LedgerAccountsService } from '../ledger-accounts/ledger-accounts.service';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { CancelVoucherDto } from './dto/cancel-voucher.dto';

interface RawEntryInput {
  accountId: string;
  debitAmount?: number;
  creditAmount?: number;
  costCenterId?: string;
  narration?: string;
}

interface ValidatedEntryInput {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  costCenterId?: string;
  narration?: string;
}

export interface AutoPostVoucherParams {
  voucherTypeCode: 'JOURNAL' | 'PAYMENT' | 'RECEIPT' | 'CONTRA';
  voucherDate: Date;
  narration?: string;
  referenceNo?: string;
  entries: RawEntryInput[];
  sourceModule: string;
  sourceReferenceId: string;
  instituteId?: string;
  userId: string;
}

const TWO_DP_EPSILON = 0.005;

/**
 * Vouchers carry a calendar date, not a timestamp. Report boundaries (Trial
 * Balance's FY end, Balance Sheet's as_of, Day/Cash/Bank Book's from/to) are
 * all parsed from date-only strings, i.e. midnight. A voucherDate with a
 * time-of-day component (e.g. from `new Date()` or a source invoice's
 * timestamp) can then land on the wrong side of an inclusive same-day cutoff
 * depending on which report's boundary it's compared against — silently
 * splitting one calendar day's postings across two different report results.
 * Truncating here, once, at every write site keeps all reports consistent.
 */
function toCalendarDate(date: Date): Date {
  return new Date(date.toISOString().slice(0, 10));
}

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
    private readonly ledgerAccountsService: LedgerAccountsService,
    private readonly financialYearsService: FinancialYearsService,
  ) {}

  private async resolveVoucherType(code: string) {
    const voucherType = await this.prisma.voucherType.findUnique({ where: { code } });
    if (!voucherType || !voucherType.isActive) throw new BadRequestException(`Voucher type "${code}" is not configured or inactive`);
    return voucherType;
  }

  /** Rules 1-2 & 5 (section 3/18): validates entry shape and account postability; returns validated entries + totals. */
  private async validateEntries(rawEntries: RawEntryInput[], instituteId?: string) {
    if (!rawEntries || rawEntries.length < 2) {
      throw new BadRequestException('A voucher must have at least two entries (one debit, one credit)');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    let hasDebit = false;
    let hasCredit = false;
    const entries: ValidatedEntryInput[] = [];

    for (const raw of rawEntries) {
      const debit = Number(raw.debitAmount ?? 0);
      const credit = Number(raw.creditAmount ?? 0);

      if (debit > 0 && credit > 0) {
        throw new BadRequestException('A single voucher entry cannot have both a debit and a credit amount');
      }
      if (debit === 0 && credit === 0) {
        throw new BadRequestException('Each voucher entry must have either a debit or a credit amount greater than zero');
      }

      await this.ledgerAccountsService.assertPostable(raw.accountId, instituteId);

      if (raw.costCenterId) {
        const costCenter = await this.prisma.costCenter.findFirst({ where: { id: raw.costCenterId, ...(instituteId ? { instituteId } : {}) } });
        if (!costCenter) throw new NotFoundException(`Cost center ${raw.costCenterId} not found`);
        if (!costCenter.isActive) throw new BadRequestException(`Cost center "${costCenter.name}" is inactive`);
      }

      if (debit > 0) hasDebit = true;
      if (credit > 0) hasCredit = true;
      totalDebit += debit;
      totalCredit += credit;
      entries.push({ accountId: raw.accountId, debitAmount: debit, creditAmount: credit, costCenterId: raw.costCenterId, narration: raw.narration });
    }

    if (!hasDebit || !hasCredit) {
      throw new BadRequestException('A voucher must contain at least one debit entry and at least one credit entry');
    }
    if (Math.abs(totalDebit - totalCredit) > TWO_DP_EPSILON) {
      throw new BadRequestException(`Voucher is not balanced: total debit (${totalDebit.toFixed(2)}) must equal total credit (${totalCredit.toFixed(2)})`);
    }

    return { entries, totalDebit: Number(totalDebit.toFixed(2)), totalCredit: Number(totalCredit.toFixed(2)) };
  }

  private async nextVoucherNumber(tx: any, voucherTypeId: string, fyId: string, prefix: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ currentNumber: number }>>`
      INSERT INTO voucher_number_sequences (id, "voucherTypeId", "fyId", "currentNumber")
      VALUES (gen_random_uuid(), ${voucherTypeId}, ${fyId}, 1)
      ON CONFLICT ("voucherTypeId", "fyId")
      DO UPDATE SET "currentNumber" = voucher_number_sequences."currentNumber" + 1
      RETURNING "currentNumber"
    `;
    const next = rows[0].currentNumber;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  private async findOpenFyForDate(date: Date, instituteId?: string) {
    const fy = await this.prisma.financialYear.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN', ...(instituteId ? { instituteId } : {}) },
    });
    if (!fy) throw new BadRequestException(`No open financial year covers ${date.toISOString().slice(0, 10)}`);
    return fy;
  }

  /**
   * Creates a voucher in DRAFT status, already fully balance-validated
   * (Rule 1) — `update()` re-validates the same way if entries are edited,
   * so a DRAFT voucher is always balanced by construction; `/post` only
   * re-checks that nothing changed underneath it (FY closed, an account
   * deactivated) since it was last written.
   */
  async create(dto: CreateVoucherDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;

    const voucherType = await this.resolveVoucherType(dto.voucherTypeCode);
    const fy = await this.financialYearsService.findOne(dto.fyId, actor);
    const voucherDate = toCalendarDate(new Date(dto.voucherDate));
    await this.financialYearsService.assertOpenAndDateInRange(fy, voucherDate);

    const { entries, totalDebit, totalCredit } = await this.validateEntries(dto.entries, instituteId);

    const voucher = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await this.nextVoucherNumber(tx, voucherType.id, fy.id, voucherType.prefix);
      return tx.voucher.create({
        data: {
          instituteId,
          voucherNumber,
          voucherTypeId: voucherType.id,
          fyId: fy.id,
          voucherDate,
          narration: dto.narration,
          referenceNo: dto.referenceNo,
          totalDebit,
          totalCredit,
          status: VoucherStatus.DRAFT,
          createdBy: userId,
          entries: {
            create: entries.map((e) => ({
              accountId: e.accountId,
              debitAmount: e.debitAmount,
              creditAmount: e.creditAmount,
              costCenterId: e.costCenterId,
              narration: e.narration,
              voucherDate,
            })),
          },
        },
        include: { entries: true, voucherType: true, financialYear: true },
      });
    });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.VOUCHER, entityId: voucher.id, action: 'CREATE', newStatus: VoucherStatus.DRAFT });
    return voucher;
  }

  async findAll(
    actor: AccountsPlatformUser,
    filters: { fyId?: string; status?: VoucherStatus; voucherTypeCode?: string; dateFrom?: string; dateTo?: string; sourceModule?: string } = {},
    page = 1,
    limit = 25,
  ) {
    const where: any = { instituteId: actor.institute_id };
    if (filters.fyId) where.fyId = filters.fyId;
    if (filters.status) where.status = filters.status;
    if (filters.sourceModule) where.sourceModule = filters.sourceModule;
    if (filters.voucherTypeCode) where.voucherType = { code: filters.voucherTypeCode };
    if (filters.dateFrom || filters.dateTo) {
      where.voucherDate = {};
      if (filters.dateFrom) where.voucherDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.voucherDate.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: { voucherType: true, financialYear: { select: { id: true, fyLabel: true } }, entries: { include: { account: true } } },
        orderBy: { voucherDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, actor: AccountsPlatformUser) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id, instituteId: actor.institute_id },
      include: {
        voucherType: true,
        financialYear: true,
        entries: { include: { account: true, costCenter: true } },
        attachments: true,
        reversalOf: { select: { id: true, voucherNumber: true } },
        reversedBy: { select: { id: true, voucherNumber: true } },
      },
    });
    if (!voucher) throw new NotFoundException(`Voucher ${id} not found`);
    return voucher;
  }

  /**
   * A voucher may only be edited while DRAFT — once posted it is immutable
   * (Rule 3), and once cancelled there is nothing left to edit. Editing
   * fully re-validates FY/date range and, if entries are replaced, the full
   * double-entry balance check (Rule 1) — the same guarantees `create()`
   * enforces, since an edited draft is just as eligible for `/post` as a
   * freshly created one.
   */
  async update(id: string, dto: UpdateVoucherDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const voucher = await this.findOne(id, actor);

    if (voucher.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException(`Cannot edit voucher in status ${voucher.status}. Only DRAFT vouchers can be edited.`);
    }

    const voucherDate = dto.voucherDate ? toCalendarDate(new Date(dto.voucherDate)) : voucher.voucherDate;
    await this.financialYearsService.assertOpenAndDateInRange(voucher.financialYear, voucherDate);

    let entries: ValidatedEntryInput[] = voucher.entries.map((e) => ({
      accountId: e.accountId,
      debitAmount: Number(e.debitAmount),
      creditAmount: Number(e.creditAmount),
      costCenterId: e.costCenterId ?? undefined,
      narration: e.narration ?? undefined,
    }));
    let totalDebit = Number(voucher.totalDebit);
    let totalCredit = Number(voucher.totalCredit);

    if (dto.entries) {
      const validated = await this.validateEntries(dto.entries, instituteId);
      entries = validated.entries;
      totalDebit = validated.totalDebit;
      totalCredit = validated.totalCredit;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.entries) {
        await tx.voucherEntry.deleteMany({ where: { voucherId: id } });
      } else if (dto.voucherDate) {
        // entries aren't being replaced, but their denormalized voucherDate must stay in sync with the voucher's own date
        await tx.voucherEntry.updateMany({ where: { voucherId: id }, data: { voucherDate } });
      }
      return tx.voucher.update({
        where: { id },
        data: {
          voucherDate,
          narration: dto.narration !== undefined ? dto.narration : undefined,
          referenceNo: dto.referenceNo !== undefined ? dto.referenceNo : undefined,
          totalDebit,
          totalCredit,
          ...(dto.entries
            ? {
                entries: {
                  create: entries.map((e) => ({
                    accountId: e.accountId,
                    debitAmount: e.debitAmount,
                    creditAmount: e.creditAmount,
                    costCenterId: e.costCenterId,
                    narration: e.narration,
                    voucherDate,
                  })),
                },
              }
            : {}),
        },
        include: { entries: true, voucherType: true, financialYear: true },
      });
    });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.VOUCHER, entityId: id, action: 'UPDATE' });
    return updated;
  }

  async post(id: string, actor: AccountsPlatformUser) {
    const userId = actor.eddva_user_id;
    const voucher = await this.findOne(id, actor);

    if (voucher.status !== VoucherStatus.DRAFT) {
      throw new BadRequestException(`Cannot post voucher in status ${voucher.status}. Must be DRAFT.`);
    }

    await this.financialYearsService.assertOpenAndDateInRange(voucher.financialYear, voucher.voucherDate);
    for (const entry of voucher.entries) {
      await this.ledgerAccountsService.assertPostable(entry.accountId, actor.institute_id);
    }
    if (Math.abs(Number(voucher.totalDebit) - Number(voucher.totalCredit)) > TWO_DP_EPSILON) {
      throw new BadRequestException('Voucher is not balanced and cannot be posted');
    }

    const posted = await this.prisma.$transaction((tx) =>
      tx.voucher.update({
        where: { id },
        data: { status: VoucherStatus.POSTED, approvedBy: userId, postedAt: new Date() },
        include: { entries: true },
      }),
    );

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.VOUCHER, entityId: id, action: 'POST', oldStatus: VoucherStatus.DRAFT, newStatus: VoucherStatus.POSTED });
    return posted;
  }

  /**
   * Rule 3: posted vouchers are immutable. A DRAFT voucher is simply marked
   * CANCELLED (it never touched the ledger). A POSTED voucher is left exactly
   * as it was — history is never rewritten — and a system-generated reversal
   * voucher with swapped debit/credit is posted to neutralize it, dated into
   * whichever financial year is currently open.
   */
  async cancel(id: string, dto: CancelVoucherDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const voucher = await this.findOne(id, actor);

    if (voucher.status === VoucherStatus.CANCELLED) {
      throw new ConflictException(`Voucher ${voucher.voucherNumber} is already cancelled`);
    }

    if (voucher.status === VoucherStatus.DRAFT) {
      const cancelled = await this.prisma.voucher.update({ where: { id }, data: { status: VoucherStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: userId } });
      await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.VOUCHER, entityId: id, action: 'CANCEL', oldStatus: VoucherStatus.DRAFT, newStatus: VoucherStatus.CANCELLED, reason: dto.reason });
      return cancelled;
    }

    // status === POSTED
    if (voucher.reversedBy) {
      throw new ConflictException(`Voucher ${voucher.voucherNumber} has already been reversed by ${voucher.reversedBy.voucherNumber}`);
    }

    const now = new Date();
    const today = toCalendarDate(now);
    const reversalFy = await this.findOpenFyForDate(today, instituteId);
    const voucherType = await this.prisma.voucherType.findUnique({ where: { id: voucher.voucherTypeId } });
    if (!voucherType) throw new NotFoundException('Voucher type not found');

    const result = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await this.nextVoucherNumber(tx, voucherType.id, reversalFy.id, voucherType.prefix);
      const reversal = await tx.voucher.create({
        data: {
          instituteId,
          voucherNumber,
          voucherTypeId: voucherType.id,
          fyId: reversalFy.id,
          voucherDate: today,
          narration: `Reversal of ${voucher.voucherNumber}${dto.reason ? `: ${dto.reason}` : ''}`,
          referenceNo: voucher.voucherNumber,
          totalDebit: voucher.totalCredit,
          totalCredit: voucher.totalDebit,
          status: VoucherStatus.POSTED,
          isAutoPosted: voucher.isAutoPosted,
          createdBy: userId,
          approvedBy: userId,
          postedAt: now,
          reversalOfId: voucher.id,
          entries: {
            create: voucher.entries.map((e) => ({
              accountId: e.accountId,
              debitAmount: e.creditAmount,
              creditAmount: e.debitAmount,
              costCenterId: e.costCenterId ?? undefined,
              narration: e.narration,
              voucherDate: today,
            })),
          },
        },
        include: { entries: true },
      });

      await tx.voucher.update({ where: { id }, data: { cancelledAt: now, cancelledBy: userId } });
      return reversal;
    });

    await this.auditService.log({
      userId,
      entityType: ACCOUNTS_ENTITY.VOUCHER,
      entityId: id,
      action: 'REVERSE',
      reason: dto.reason,
      metadata: { reversalVoucherId: result.id, reversalVoucherNumber: result.voucherNumber },
    });
    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.VOUCHER, entityId: result.id, action: 'CREATE', newStatus: VoucherStatus.POSTED, metadata: { reversalOf: voucher.voucherNumber } });

    return result;
  }

  /**
   * Entry point for other modules (section 12/19 AutoPostingService). Creates
   * and immediately posts a system-generated voucher — no manual draft/post
   * step for automatic entries — with source traceability, and is idempotent
   * per (sourceModule, sourceReferenceId): a repeat call returns the
   * already-posted voucher instead of creating a duplicate.
   *
   * Takes a plain `userId`/`instituteId` pair rather than an
   * AccountsPlatformUser — this is an internal service-to-service API called
   * directly by Sales/Purchase (core-RBAC modules), not an HTTP action
   * guarded by the Accounts satellite auth, so there is no Accounts actor to
   * speak of here.
   */
  async createAndPostAuto(params: AutoPostVoucherParams) {
    const existing = await this.prisma.voucher.findFirst({ where: { sourceModule: params.sourceModule, sourceReferenceId: params.sourceReferenceId } });
    if (existing) return existing;

    const voucherDate = toCalendarDate(params.voucherDate);
    const voucherType = await this.resolveVoucherType(params.voucherTypeCode);
    const fy = await this.findOpenFyForDate(voucherDate, params.instituteId);
    await this.financialYearsService.assertOpenAndDateInRange(fy, voucherDate);

    const { entries, totalDebit, totalCredit } = await this.validateEntries(params.entries, params.instituteId);

    const voucher = await this.prisma.$transaction(async (tx) => {
      const voucherNumber = await this.nextVoucherNumber(tx, voucherType.id, fy.id, voucherType.prefix);
      return tx.voucher.create({
        data: {
          instituteId: params.instituteId,
          voucherNumber,
          voucherTypeId: voucherType.id,
          fyId: fy.id,
          voucherDate,
          narration: params.narration,
          referenceNo: params.referenceNo,
          totalDebit,
          totalCredit,
          status: VoucherStatus.POSTED,
          isAutoPosted: true,
          sourceModule: params.sourceModule,
          sourceReferenceId: params.sourceReferenceId,
          createdBy: params.userId,
          approvedBy: params.userId,
          postedAt: new Date(),
          entries: {
            create: entries.map((e) => ({
              accountId: e.accountId,
              debitAmount: e.debitAmount,
              creditAmount: e.creditAmount,
              costCenterId: e.costCenterId,
              narration: e.narration,
              voucherDate,
            })),
          },
        },
        include: { entries: true },
      });
    });

    await this.auditService.log({
      userId: params.userId,
      entityType: ACCOUNTS_ENTITY.VOUCHER,
      entityId: voucher.id,
      action: 'AUTO_POST',
      newStatus: VoucherStatus.POSTED,
      metadata: { sourceModule: params.sourceModule, sourceReferenceId: params.sourceReferenceId },
    });

    return voucher;
  }
}
