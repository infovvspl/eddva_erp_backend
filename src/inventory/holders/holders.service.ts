import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateHolderDto } from './dto/create-holder.dto';
import { UpdateHolderDto } from './dto/update-holder.dto';

@Injectable()
export class HoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  async create(dto: CreateHolderDto, actorId?: string) {
    const holder = await this.prisma.invHolder.create({
      data: { holder_type: dto.holder_type as any, name: dto.name, external_ref_id: dto.external_ref_id, contact_phone: dto.contact_phone },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.HOLDER, entityId: String(holder.holder_id), action: 'create' });
    return holder;
  }

  async findAll(params: { search?: string; holder_type?: string; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.holder_type) where.holder_type = params.holder_type;
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invHolder.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.invHolder.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const holder = await this.prisma.invHolder.findUnique({ where: { holder_id: id } });
    if (!holder) throw new NotFoundException(`Holder #${id} not found`);
    return holder;
  }

  async update(id: number, dto: UpdateHolderDto, actorId?: string) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.invHolder.update({
      where: { holder_id: id },
      data: { name: dto.name, external_ref_id: dto.external_ref_id, contact_phone: dto.contact_phone, status: dto.status as any },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.HOLDER, entityId: String(id), action: 'update', oldStatus: existing.status, newStatus: updated.status });
    return updated;
  }

  async currentIssues(id: number) {
    await this.findOne(id);
    return this.prisma.invAssetIssue.findMany({
      where: { holder_id: id, status: { in: ['issued', 'partially_returned', 'overdue', 'pending_approval'] } },
      include: {
        item: { select: { item_id: true, name: true, item_code: true, item_type: true } },
        asset_unit: { select: { asset_unit_id: true, asset_tag: true } },
        source_location: { select: { location_id: true, name: true } },
      },
      orderBy: { issue_date: 'desc' },
    });
  }
}
