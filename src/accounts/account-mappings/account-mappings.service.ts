import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { SetAccountMappingDto } from './dto/set-account-mapping.dto';

@Injectable()
export class AccountMappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  async set(dto: SetAccountMappingDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id: dto.accountId, instituteId } });
    if (!account) throw new NotFoundException(`Ledger account ${dto.accountId} not found`);
    if (!account.allowVoucherEntry) throw new BadRequestException(`"${account.accountName}" is not a postable account and cannot be used for auto-posting`);

    const existing = await this.prisma.accountMapping.findFirst({ where: { mappingKey: dto.mappingKey, instituteId } });
    const mapping = existing
      ? await this.prisma.accountMapping.update({ where: { id: existing.id }, data: { accountId: dto.accountId } })
      : await this.prisma.accountMapping.create({ data: { instituteId, mappingKey: dto.mappingKey, accountId: dto.accountId } });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.ACCOUNT_MAPPING, entityId: mapping.id, action: 'SET', metadata: { mappingKey: dto.mappingKey, accountId: dto.accountId } });
    return mapping;
  }

  async findAll(actor: AccountsPlatformUser) {
    return this.prisma.accountMapping.findMany({ where: { instituteId: actor.institute_id }, include: { account: { select: { accountCode: true, accountName: true } } } });
  }

  /** Resolves a logical role (AR/AP/CASH/...) to its configured ledger account id; throws a clear, actionable error if unconfigured. */
  async resolve(mappingKey: string, instituteId?: string): Promise<string> {
    const mapping = await this.prisma.accountMapping.findFirst({ where: { mappingKey, ...(instituteId ? { instituteId } : {}) } });
    if (!mapping) {
      throw new BadRequestException(`No ledger account is mapped to "${mappingKey}" for auto-posting — configure it via POST /api/accounts/account-mappings first`);
    }
    return mapping.accountId;
  }
}
