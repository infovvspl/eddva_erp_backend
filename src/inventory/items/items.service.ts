import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpsertItemVendorDto } from './dto/upsert-item-vendor.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  private async assertCategoryExists(categoryId: number) {
    const category = await this.prisma.invCategory.findUnique({ where: { category_id: categoryId } });
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);
  }

  async create(dto: CreateItemDto, actorId?: string) {
    const existing = await this.prisma.invItem.findUnique({ where: { item_code: dto.item_code } });
    if (existing) throw new ConflictException(`Item code "${dto.item_code}" already exists`);
    await this.assertCategoryExists(dto.category_id);

    const item = await this.prisma.invItem.create({
      data: {
        item_code: dto.item_code,
        name: dto.name,
        category_id: dto.category_id,
        item_type: dto.item_type as any,
        unit_of_measure: dto.unit_of_measure,
        reorder_level: dto.reorder_level ?? 0,
        description: dto.description,
        image_url: dto.image_url,
      },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.ITEM, entityId: String(item.item_id), action: 'create' });
    return item;
  }

  async findAll(params: { search?: string; category_id?: number; item_type?: string; low_stock?: boolean; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.category_id) where.category_id = params.category_id;
    if (params.item_type) where.item_type = params.item_type;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { item_code: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.low_stock) {
      const lowStockItemIds = await this.findLowStockItemIds();
      where.item_id = { in: lowStockItemIds.length > 0 ? lowStockItemIds : [-1] };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invItem.findMany({
        where,
        include: { category: { select: { category_id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invItem.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /** Items whose total stock across all locations is at or below their reorder_level. */
  private async findLowStockItemIds(): Promise<number[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ item_id: number }>>(
      `SELECT i.item_id
       FROM inv_items i
       LEFT JOIN (
         SELECT item_id, SUM(quantity) AS total_qty
         FROM inv_stock_balances
         GROUP BY item_id
       ) b ON b.item_id = i.item_id
       WHERE i.status = 'ACTIVE' AND COALESCE(b.total_qty, 0) <= i.reorder_level`,
    );
    return rows.map((r) => r.item_id);
  }

  async findOne(id: number) {
    const item = await this.prisma.invItem.findUnique({
      where: { item_id: id },
      include: {
        category: true,
        item_vendors: { include: { vendor: { select: { vendor_id: true, name: true } } } },
        balances: { include: { location: { select: { location_id: true, name: true } } } },
      },
    });
    if (!item) throw new NotFoundException(`Item #${id} not found`);
    return item;
  }

  private async assertExists(id: number) {
    const item = await this.prisma.invItem.findUnique({ where: { item_id: id } });
    if (!item) throw new NotFoundException(`Item #${id} not found`);
    return item;
  }

  async update(id: number, dto: UpdateItemDto, actorId?: string) {
    const existing = await this.assertExists(id);

    if (dto.item_code && dto.item_code !== existing.item_code) {
      const clash = await this.prisma.invItem.findUnique({ where: { item_code: dto.item_code } });
      if (clash) throw new ConflictException(`Item code "${dto.item_code}" already exists`);
    }
    if (dto.category_id) await this.assertCategoryExists(dto.category_id);

    const updated = await this.prisma.invItem.update({
      where: { item_id: id },
      data: {
        item_code: dto.item_code,
        name: dto.name,
        category_id: dto.category_id,
        unit_of_measure: dto.unit_of_measure,
        reorder_level: dto.reorder_level,
        description: dto.description,
        image_url: dto.image_url,
        status: dto.status as any,
      },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.ITEM, entityId: String(id), action: 'update', oldStatus: existing.status, newStatus: updated.status });
    return updated;
  }

  async upsertVendor(itemId: number, dto: UpsertItemVendorDto, actorId?: string) {
    await this.assertExists(itemId);
    const vendor = await this.prisma.invVendor.findUnique({ where: { vendor_id: dto.vendor_id } });
    if (!vendor) throw new NotFoundException(`Vendor #${dto.vendor_id} not found`);

    const result = await this.prisma.invItemVendor.upsert({
      where: { item_id_vendor_id: { item_id: itemId, vendor_id: dto.vendor_id } },
      update: { last_purchase_price: dto.last_purchase_price },
      create: { item_id: itemId, vendor_id: dto.vendor_id, last_purchase_price: dto.last_purchase_price },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.ITEM, entityId: String(itemId), action: 'vendor_associate', metadata: { vendor_id: dto.vendor_id } });
    return result;
  }

  async listVendors(itemId: number) {
    await this.assertExists(itemId);
    return this.prisma.invItemVendor.findMany({
      where: { item_id: itemId },
      include: { vendor: true },
      orderBy: { last_purchase_price: 'asc' },
    });
  }
}
