import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
    private readonly ledger: InventoryStockLedgerService,
  ) {}

  async create(dto: CreateTransferDto, actorId?: string) {
    if (dto.from_location_id === dto.to_location_id) {
      throw new BadRequestException('from_location_id and to_location_id must differ');
    }

    const item = await this.prisma.invItem.findUnique({ where: { item_id: dto.item_id } });
    if (!item) throw new NotFoundException(`Item #${dto.item_id} not found`);

    const [fromLocation, toLocation] = await Promise.all([
      this.prisma.invLocation.findUnique({ where: { location_id: dto.from_location_id } }),
      this.prisma.invLocation.findUnique({ where: { location_id: dto.to_location_id } }),
    ]);
    if (!fromLocation) throw new NotFoundException(`Location #${dto.from_location_id} not found`);
    if (!toLocation) throw new NotFoundException(`Location #${dto.to_location_id} not found`);

    // Decrement-then-increment inside one transaction: the decrement's
    // atomic "quantity >= n" guard is what actually prevents transferring
    // more than is available — see InventoryStockLedgerService.
    const transfer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invStockTransfer.create({
        data: {
          item_id: dto.item_id,
          from_location_id: dto.from_location_id,
          to_location_id: dto.to_location_id,
          quantity: dto.quantity,
          transfer_date: new Date(dto.transfer_date),
          created_by: actorId,
        },
      });

      await this.ledger.decrement(tx, 'transfer_out', {
        item_id: dto.item_id,
        location_id: dto.from_location_id,
        quantity: dto.quantity,
        reference_type: 'transfer',
        reference_id: created.transfer_id,
        transfer_id: created.transfer_id,
        created_by: actorId,
      });

      await this.ledger.increment(tx, 'transfer_in', {
        item_id: dto.item_id,
        location_id: dto.to_location_id,
        quantity: dto.quantity,
        reference_type: 'transfer',
        reference_id: created.transfer_id,
        transfer_id: created.transfer_id,
        created_by: actorId,
      });

      return created;
    });

    await this.audit.log({
      userId: actorId,
      entityType: INV_ENTITY.TRANSFER,
      entityId: String(transfer.transfer_id),
      action: 'create',
      metadata: { item_id: dto.item_id, from: dto.from_location_id, to: dto.to_location_id, quantity: dto.quantity },
    });

    return transfer;
  }

  async findAll(params: { item_id?: number; location_id?: number; date_from?: string; date_to?: string; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.item_id) where.item_id = params.item_id;
    if (params.location_id) where.OR = [{ from_location_id: params.location_id }, { to_location_id: params.location_id }];
    if (params.date_from || params.date_to) {
      where.transfer_date = {};
      if (params.date_from) where.transfer_date.gte = new Date(params.date_from);
      if (params.date_to) where.transfer_date.lte = new Date(params.date_to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invStockTransfer.findMany({
        where,
        include: {
          item: { select: { item_id: true, name: true, item_code: true } },
          from_location: { select: { location_id: true, name: true } },
          to_location: { select: { location_id: true, name: true } },
        },
        orderBy: { transfer_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invStockTransfer.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const transfer = await this.prisma.invStockTransfer.findUnique({
      where: { transfer_id: id },
      include: { item: true, from_location: true, to_location: true },
    });
    if (!transfer) throw new NotFoundException(`Transfer #${id} not found`);
    return transfer;
  }
}
