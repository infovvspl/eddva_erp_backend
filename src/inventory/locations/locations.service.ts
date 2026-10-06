import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  async create(instituteId: string, dto: CreateLocationDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.prisma.invLocation.findFirst({ where: { name: dto.name, institute_id } });
    if (existing) throw new ConflictException(`Location "${dto.name}" already exists`);

    const location = await this.prisma.invLocation.create({ data: { name: dto.name, type: dto.type as any, institute_id } });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.LOCATION, entityId: String(location.location_id), action: 'create' });
    return location;
  }

  async findAll(instituteId: string, search?: string, type?: string) {
    return this.prisma.invLocation.findMany({
      where: {
        institute_id: requireInstituteId(instituteId),
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
        type: type as any,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const location = await this.prisma.invLocation.findFirst({ where: { location_id: id, institute_id: requireInstituteId(instituteId) } });
    if (!location) throw new NotFoundException(`Location #${id} not found`);
    return location;
  }

  async update(instituteId: string, id: number, dto: UpdateLocationDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.findOne(institute_id, id);

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.invLocation.findFirst({ where: { name: dto.name, institute_id } });
      if (clash) throw new ConflictException(`Location "${dto.name}" already exists`);
    }

    const updated = await this.prisma.invLocation.update({
      where: { location_id: id },
      data: { name: dto.name, type: dto.type as any, status: dto.status as any },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.LOCATION, entityId: String(id), action: 'update', oldStatus: existing.status, newStatus: updated.status });
    return updated;
  }
}
