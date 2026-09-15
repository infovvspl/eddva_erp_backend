import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { CreateUomDto, UpdateUomDto } from './dto/uom.dto';

@Injectable()
export class UomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  async create(instituteId: string, dto: CreateUomDto, actorId?: string) {
    const existing = await this.prisma.spUom.findUnique({
      where: {
        institute_id_name: { institute_id: instituteId, name: dto.name },
      },
    });
    if (existing)
      throw new ConflictException(`UOM "${dto.name}" already exists`);

    const uom = await this.prisma.spUom.create({
      data: { institute_id: instituteId, name: dto.name, symbol: dto.symbol },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.UOM,
      entityId: String(uom.uom_id),
      action: 'create',
    });
    return uom;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.spUom.findMany({
      where: {
        institute_id: instituteId,
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const uom = await this.prisma.spUom.findFirst({
      where: { uom_id: id, institute_id: instituteId },
    });
    if (!uom) throw new NotFoundException(`UOM #${id} not found`);
    return uom;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateUomDto,
    actorId?: string,
  ) {
    const existing = await this.findOne(instituteId, id);
    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.spUom.findUnique({
        where: {
          institute_id_name: { institute_id: instituteId, name: dto.name },
        },
      });
      if (clash)
        throw new ConflictException(`UOM "${dto.name}" already exists`);
    }

    const updated = await this.prisma.spUom.update({
      where: { uom_id: id },
      data: { name: dto.name, symbol: dto.symbol, status: dto.status },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.UOM,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /** Hard delete. sp_items.uom_id is a non-nullable FK, so blocked while any item still uses this UOM. */
  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);

    const itemCount = await this.prisma.spItem.count({ where: { uom_id: id } });
    if (itemCount > 0) {
      throw new ConflictException(
        `UOM #${id} has ${itemCount} item(s) referencing it and cannot be deleted. Reassign or delete those items first.`,
      );
    }

    await this.prisma.spUom.delete({ where: { uom_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.UOM,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }
}
