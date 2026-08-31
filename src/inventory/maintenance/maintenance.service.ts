import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  async create(dto: CreateMaintenanceDto, actorId?: string) {
    const assetUnit = await this.prisma.invAssetUnit.findUnique({ where: { asset_unit_id: dto.asset_unit_id } });
    if (!assetUnit) throw new NotFoundException(`Asset unit #${dto.asset_unit_id} not found`);

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invAssetMaintenance.create({
        data: {
          asset_unit_id: dto.asset_unit_id,
          issue_reported: dto.issue_reported,
          service_date: dto.service_date ? new Date(dto.service_date) : undefined,
          cost: dto.cost,
          created_by: actorId,
        },
      });

      // An asset with an open maintenance ticket shouldn't look available/issuable.
      if (assetUnit.status !== 'issued' && assetUnit.status !== 'disposed') {
        await tx.invAssetUnit.update({ where: { asset_unit_id: dto.asset_unit_id }, data: { status: 'under_repair' } });
      }

      return created;
    });

    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.MAINTENANCE, entityId: String(record.maintenance_id), action: 'create', metadata: { asset_unit_id: dto.asset_unit_id } });
    return record;
  }

  async findAll(params: { asset_unit_id?: number; status?: string; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.asset_unit_id) where.asset_unit_id = params.asset_unit_id;
    if (params.status) where.status = params.status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invAssetMaintenance.findMany({
        where,
        include: { asset_unit: { select: { asset_unit_id: true, asset_tag: true, item: { select: { name: true } } } } },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invAssetMaintenance.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const record = await this.prisma.invAssetMaintenance.findUnique({
      where: { maintenance_id: id },
      include: { asset_unit: true },
    });
    if (!record) throw new NotFoundException(`Maintenance record #${id} not found`);
    return record;
  }

  async update(id: number, dto: UpdateMaintenanceDto, actorId?: string) {
    const existing = await this.findOne(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.invAssetMaintenance.update({
        where: { maintenance_id: id },
        data: {
          status: dto.status as any,
          service_date: dto.service_date ? new Date(dto.service_date) : undefined,
          cost: dto.cost,
        },
      });

      if (dto.status === 'resolved' && existing.status !== 'resolved') {
        const otherOpenTickets = await tx.invAssetMaintenance.count({
          where: { asset_unit_id: existing.asset_unit_id, status: { not: 'resolved' }, maintenance_id: { not: id } },
        });
        if (otherOpenTickets === 0) {
          const assetUnit = await tx.invAssetUnit.findUnique({ where: { asset_unit_id: existing.asset_unit_id } });
          if (assetUnit?.status === 'under_repair') {
            await tx.invAssetUnit.update({ where: { asset_unit_id: existing.asset_unit_id }, data: { status: 'in_store' } });
          }
        }
      }

      return result;
    });

    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.MAINTENANCE, entityId: String(id), action: 'update', oldStatus: existing.status, newStatus: updated.status });
    return updated;
  }
}
