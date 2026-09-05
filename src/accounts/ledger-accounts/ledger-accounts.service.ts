import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto';
import { UpdateLedgerAccountDto } from './dto/update-ledger-account.dto';

@Injectable()
export class LedgerAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  async create(dto: CreateLedgerAccountDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;

    const group = await this.prisma.accountGroup.findFirst({ where: { id: dto.groupId, instituteId } });
    if (!group) throw new NotFoundException(`Account group ${dto.groupId} not found`);

    const existing = await this.prisma.ledgerAccount.findFirst({ where: { accountCode: dto.accountCode, instituteId } });
    if (existing) throw new ConflictException(`Ledger account code "${dto.accountCode}" already exists`);

    const account = await this.prisma.ledgerAccount.create({
      data: {
        accountCode: dto.accountCode,
        accountName: dto.accountName,
        groupId: dto.groupId,
        openingBalance: dto.openingBalance ?? 0,
        openingBalanceType: dto.openingBalanceType ?? 'DEBIT',
        allowVoucherEntry: dto.allowVoucherEntry ?? true,
        isActive: dto.isActive ?? true,
        isCashAccount: dto.isCashAccount ?? false,
        isBankAccount: dto.isBankAccount ?? false,
        instituteId,
      },
    });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.LEDGER_ACCOUNT, entityId: account.id, action: 'CREATE' });
    return account;
  }

  async findAll(actor: AccountsPlatformUser, filters: { search?: string; groupId?: string; isActive?: boolean } = {}) {
    const where: any = { instituteId: actor.institute_id };
    if (filters.search) {
      where.OR = [
        { accountCode: { contains: filters.search, mode: 'insensitive' } },
        { accountName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.groupId) where.groupId = filters.groupId;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    return this.prisma.ledgerAccount.findMany({
      where,
      include: { group: { select: { id: true, groupName: true, nature: true } } },
      orderBy: { accountCode: 'asc' },
    });
  }

  async findOne(id: string, actor: AccountsPlatformUser) {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id, instituteId: actor.institute_id },
      include: { group: true },
    });
    if (!account) throw new NotFoundException(`Ledger account ${id} not found`);
    return account;
  }

  /** Rules 2 & 5 (section 3/18): only active, postable (leaf) ledger accounts may receive voucher entries. */
  async assertPostable(accountId: string, instituteId?: string) {
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, ...(instituteId ? { instituteId } : {}) } });
    if (!account) throw new NotFoundException(`Ledger account ${accountId} not found`);
    if (!account.isActive) throw new BadRequestException(`Ledger account "${account.accountName}" is inactive and cannot receive voucher entries`);
    if (!account.allowVoucherEntry) {
      throw new BadRequestException(`Ledger account "${account.accountName}" is a structural/group-level account and cannot receive voucher entries directly`);
    }
    return account;
  }

  async update(id: string, dto: UpdateLedgerAccountDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const existing = await this.findOne(id, actor);

    if (dto.accountCode && dto.accountCode !== existing.accountCode) {
      const clash = await this.prisma.ledgerAccount.findFirst({ where: { accountCode: dto.accountCode, instituteId } });
      if (clash) throw new ConflictException(`Ledger account code "${dto.accountCode}" already exists`);
    }

    if (dto.groupId && dto.groupId !== existing.groupId) {
      const group = await this.prisma.accountGroup.findFirst({ where: { id: dto.groupId, instituteId } });
      if (!group) throw new NotFoundException(`Account group ${dto.groupId} not found`);
    }

    const updated = await this.prisma.ledgerAccount.update({
      where: { id },
      data: {
        accountCode: dto.accountCode,
        accountName: dto.accountName,
        groupId: dto.groupId,
        allowVoucherEntry: dto.allowVoucherEntry,
        isActive: dto.isActive,
        isCashAccount: dto.isCashAccount,
        isBankAccount: dto.isBankAccount,
      },
    });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.LEDGER_ACCOUNT, entityId: id, action: 'UPDATE' });
    return updated;
  }
}
