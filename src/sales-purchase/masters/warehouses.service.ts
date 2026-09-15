import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  async create(instituteId: string, dto: CreateWarehouseDto, actorId?: string) {
    const existing = await this.prisma.spWarehouse.findUnique({
      where: {
        institute_id_name: { institute_id: instituteId, name: dto.name },
      },
    });
    if (existing)
      throw new ConflictException(`Warehouse "${dto.name}" already exists`);

    const warehouse = await this.prisma.$transaction(async (tx) => {
      if (dto.is_default) {
        await tx.spWarehouse.updateMany({
          where: { institute_id: instituteId, is_default: true },
          data: { is_default: false },
        });
      }
      return tx.spWarehouse.create({
        data: {
          institute_id: instituteId,
          name: dto.name,
          address: dto.address,
          is_default: dto.is_default ?? false,
        },
      });
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.WAREHOUSE,
      entityId: String(warehouse.warehouse_id),
      action: 'create',
    });
    return warehouse;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.spWarehouse.findMany({
      where: {
        institute_id: instituteId,
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const warehouse = await this.prisma.spWarehouse.findFirst({
      where: { warehouse_id: id, institute_id: instituteId },
    });
    if (!warehouse) throw new NotFoundException(`Warehouse #${id} not found`);
    return warehouse;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateWarehouseDto,
    actorId?: string,
  ) {
    const existing = await this.findOne(instituteId, id);
    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.spWarehouse.findUnique({
        where: {
          institute_id_name: { institute_id: instituteId, name: dto.name },
        },
      });
      if (clash)
        throw new ConflictException(`Warehouse "${dto.name}" already exists`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.is_default === true) {
        await tx.spWarehouse.updateMany({
          where: {
            institute_id: instituteId,
            is_default: true,
            warehouse_id: { not: id },
          },
          data: { is_default: false },
        });
      }
      return tx.spWarehouse.update({
        where: { warehouse_id: id },
        data: {
          name: dto.name,
          address: dto.address,
          is_default: dto.is_default,
          status: dto.status,
        },
      });
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.WAREHOUSE,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /** Hard delete. Blocked while any purchase order or GRN still references this warehouse. */
  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);

    const [poCount, grnCount] = await Promise.all([
      this.prisma.spPurchaseOrder.count({ where: { warehouse_id: id } }),
      this.prisma.spGrn.count({ where: { warehouse_id: id } }),
    ]);
    const usageCount = poCount + grnCount;
    if (usageCount > 0) {
      throw new ConflictException(
        `Warehouse #${id} is referenced by ${usageCount} purchase order(s)/GRN(s) and cannot be deleted.`,
      );
    }

    await this.prisma.spWarehouse.delete({ where: { warehouse_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.WAREHOUSE,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }
}
