import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

  async create(dto: CreateLocationDto, actorId?: string) {
    const existing = await this.prisma.invLocation.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Location "${dto.name}" already exists`);

    const location = await this.prisma.invLocation.create({ data: { name: dto.name, type: dto.type as any } });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.LOCATION, entityId: String(location.location_id), action: 'create' });
    return location;
  }

  async findAll(search?: string, type?: string) {
    return this.prisma.invLocation.findMany({
      where: {
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
        type: type as any,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const location = await this.prisma.invLocation.findUnique({ where: { location_id: id } });
    if (!location) throw new NotFoundException(`Location #${id} not found`);
    return location;
  }

  async update(id: number, dto: UpdateLocationDto, actorId?: string) {
    const existing = await this.findOne(id);

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.invLocation.findUnique({ where: { name: dto.name } });
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
