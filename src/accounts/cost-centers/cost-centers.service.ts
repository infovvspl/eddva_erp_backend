import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@Injectable()
export class CostCentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  async create(dto: CreateCostCenterDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    const existing = await this.prisma.costCenter.findFirst({ where: { name: dto.name, instituteId } });
    if (existing) throw new ConflictException(`Cost center "${dto.name}" already exists`);

    const costCenter = await this.prisma.costCenter.create({
      data: { name: dto.name, isActive: dto.isActive ?? true, instituteId },
    });
    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.COST_CENTER, entityId: costCenter.id, action: 'CREATE' });
    return costCenter;
  }

  async findAll(actor: AccountsPlatformUser, search?: string) {
    return this.prisma.costCenter.findMany({
      where: { instituteId: actor.institute_id, ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, actor: AccountsPlatformUser) {
    const costCenter = await this.prisma.costCenter.findFirst({ where: { id, instituteId: actor.institute_id } });
    if (!costCenter) throw new NotFoundException(`Cost center ${id} not found`);
    return costCenter;
  }

  async update(id: string, dto: UpdateCostCenterDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    await this.findOne(id, actor);

    if (dto.name) {
      const clash = await this.prisma.costCenter.findFirst({ where: { name: dto.name, instituteId } });
      if (clash && clash.id !== id) throw new ConflictException(`Cost center "${dto.name}" already exists`);
    }

    const updated = await this.prisma.costCenter.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } });
    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.COST_CENTER, entityId: id, action: 'UPDATE' });
    return updated;
  }
}
