import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
    private readonly ledger: InventoryStockLedgerService,
  ) {}

  async create(dto: CreateAdjustmentDto, actorId?: string) {
    if (dto.quantity_delta === 0) {
      throw new BadRequestException('quantity_delta must not be zero');
    }

    const item = await this.prisma.invItem.findUnique({ where: { item_id: dto.item_id } });
    if (!item) throw new NotFoundException(`Item #${dto.item_id} not found`);

    const location = await this.prisma.invLocation.findUnique({ where: { location_id: dto.location_id } });
    if (!location) throw new NotFoundException(`Location #${dto.location_id} not found`);

    const adjustment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invStockAdjustment.create({
        data: {
          item_id: dto.item_id,
          location_id: dto.location_id,
          quantity_delta: dto.quantity_delta,
          reason: dto.reason as any,
          remarks: dto.remarks,
          created_by: actorId,
        },
      });

      const movement = {
        item_id: dto.item_id,
        location_id: dto.location_id,
        quantity: Math.abs(dto.quantity_delta),
        reference_type: 'adjustment' as const,
        reference_id: created.adjustment_id,
        adjustment_id: created.adjustment_id,
        created_by: actorId,
      };

      if (dto.quantity_delta > 0) {
        await this.ledger.increment(tx, 'adjustment_in', movement);
      } else {
        await this.ledger.decrement(tx, 'adjustment_out', movement);
      }

      return created;
    });

    await this.audit.log({
      userId: actorId,
      entityType: INV_ENTITY.ADJUSTMENT,
      entityId: String(adjustment.adjustment_id),
      action: 'create',
      reason: dto.remarks,
      metadata: { item_id: dto.item_id, location_id: dto.location_id, quantity_delta: dto.quantity_delta, reason: dto.reason },
    });

    return adjustment;
  }

  async findAll(params: { item_id?: number; location_id?: number; reason?: string; date_from?: string; date_to?: string; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.item_id) where.item_id = params.item_id;
    if (params.location_id) where.location_id = params.location_id;
    if (params.reason) where.reason = params.reason;
    if (params.date_from || params.date_to) {
      where.created_at = {};
      if (params.date_from) where.created_at.gte = new Date(params.date_from);
      if (params.date_to) where.created_at.lte = new Date(params.date_to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invStockAdjustment.findMany({
        where,
        include: {
          item: { select: { item_id: true, name: true, item_code: true } },
          location: { select: { location_id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invStockAdjustment.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const adjustment = await this.prisma.invStockAdjustment.findUnique({
      where: { adjustment_id: id },
      include: { item: true, location: true },
    });
    if (!adjustment) throw new NotFoundException(`Adjustment #${id} not found`);
    return adjustment;
  }
}
