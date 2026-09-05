import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { CreateAccountGroupDto } from './dto/create-account-group.dto';
import { UpdateAccountGroupDto } from './dto/update-account-group.dto';

@Injectable()
export class AccountGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  private async assertParentExists(parentGroupId: string, instituteId: string) {
    const parent = await this.prisma.accountGroup.findFirst({ where: { id: parentGroupId, instituteId } });
    if (!parent) throw new NotFoundException(`Parent account group ${parentGroupId} not found`);
    return parent;
  }

  /** Walks up the parent chain to make sure `candidateParentId` is not `groupId` itself or a descendant of it. */
  private async assertNoCycle(groupId: string, candidateParentId: string) {
    let cursor: string | null = candidateParentId;
    while (cursor) {
      if (cursor === groupId) {
        throw new ConflictException('A group cannot be re-parented under itself or one of its own descendants');
      }
      const row: { parentGroupId: string | null } | null = await this.prisma.accountGroup.findUnique({
        where: { id: cursor },
        select: { parentGroupId: true },
      });
      cursor = row?.parentGroupId ?? null;
    }
  }

  async create(dto: CreateAccountGroupDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;

    if (dto.parentGroupId) await this.assertParentExists(dto.parentGroupId, instituteId);

    const existing = await this.prisma.accountGroup.findFirst({ where: { groupName: dto.groupName, instituteId } });
    if (existing) throw new ConflictException(`Account group "${dto.groupName}" already exists`);

    const group = await this.prisma.accountGroup.create({
      data: {
        groupName: dto.groupName,
        parentGroupId: dto.parentGroupId,
        nature: dto.nature,
        instituteId,
      },
    });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.ACCOUNT_GROUP, entityId: group.id, action: 'CREATE' });
    return group;
  }

  async findAll(actor: AccountsPlatformUser, search?: string) {
    return this.prisma.accountGroup.findMany({
      where: { instituteId: actor.institute_id, ...(search ? { groupName: { contains: search, mode: 'insensitive' as const } } : {}) },
      include: {
        parentGroup: { select: { id: true, groupName: true } },
        _count: { select: { childGroups: true, ledgerAccounts: true } },
      },
      orderBy: { groupName: 'asc' },
    });
  }

  async findOne(id: string, actor: AccountsPlatformUser) {
    const group = await this.prisma.accountGroup.findFirst({
      where: { id, instituteId: actor.institute_id },
      include: { parentGroup: true, childGroups: true, ledgerAccounts: true },
    });
    if (!group) throw new NotFoundException(`Account group ${id} not found`);
    return group;
  }

  async update(id: string, dto: UpdateAccountGroupDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const existing = await this.findOne(id, actor);

    if (dto.groupName && dto.groupName !== existing.groupName) {
      const clash = await this.prisma.accountGroup.findFirst({ where: { groupName: dto.groupName, instituteId } });
      if (clash) throw new ConflictException(`Account group "${dto.groupName}" already exists`);
    }

    if (dto.parentGroupId) {
      if (dto.parentGroupId === id) throw new ConflictException('A group cannot be its own parent');
      await this.assertParentExists(dto.parentGroupId, instituteId);
      await this.assertNoCycle(id, dto.parentGroupId);
    }

    if (dto.nature && dto.nature !== existing.nature && existing.ledgerAccounts.length > 0) {
      throw new BadRequestException(
        `Cannot change the nature of "${existing.groupName}" — it already has ${existing.ledgerAccounts.length} ledger account(s) reporting under its current nature`,
      );
    }

    const updated = await this.prisma.accountGroup.update({
      where: { id },
      data: { groupName: dto.groupName, parentGroupId: dto.parentGroupId, nature: dto.nature },
    });

    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.ACCOUNT_GROUP, entityId: id, action: 'UPDATE' });
    return updated;
  }
}
