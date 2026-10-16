import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { IMAGE_RULES, InventoryFileStorageService } from '../common/inventory-file-storage.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpsertItemVendorDto } from './dto/upsert-item-vendor.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
    private readonly files: InventoryFileStorageService,
  ) {}

  /**
   * Units of Measure dropdown source. Inventory has no master of its own —
   * this reuses Sales & Purchase's `sp_uoms` table (same database, same
   * institute scoping) rather than maintaining a second, duplicate list.
   */
  async listUoms(instituteId: string) {
    const institute_id = requireInstituteId(instituteId);
    return this.prisma.spUom.findMany({
      where: { institute_id },
      orderBy: { name: 'asc' },
    });
  }

  async uploadImage(instituteId: string, file: Express.Multer.File | undefined) {
    const institute_id = requireInstituteId(instituteId);
    const stored = await this.files.save(institute_id, 'item-images', file, IMAGE_RULES);
    return { path: stored.path };
  }

  imagePath(instituteId: string, relativePath: string): string {
    return this.files.resolve(relativePath, requireInstituteId(instituteId));
  }

  private async assertCategoryExists(instituteId: string, categoryId: number) {
    const category = await this.prisma.invCategory.findFirst({ where: { category_id: categoryId, institute_id: instituteId } });
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);
  }

  async create(instituteId: string, dto: CreateItemDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.prisma.invItem.findFirst({ where: { item_code: dto.item_code, institute_id } });
    if (existing) throw new ConflictException(`Item code "${dto.item_code}" already exists`);
    await this.assertCategoryExists(institute_id, dto.category_id);

    const item = await this.prisma.invItem.create({
      data: {
        institute_id,
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

  async findAll(instituteId: string, params: { search?: string; category_id?: number; item_type?: string; low_stock?: boolean; page?: number; limit?: number }) {
    const institute_id = requireInstituteId(instituteId);
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = { institute_id };
    if (params.category_id) where.category_id = params.category_id;
    if (params.item_type) where.item_type = params.item_type;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { item_code: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.low_stock) {
      const lowStockItemIds = await this.findLowStockItemIds(institute_id);
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
  private async findLowStockItemIds(instituteId: string): Promise<number[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ item_id: number }>>(
      `SELECT i.item_id
       FROM inv_items i
       LEFT JOIN (
         SELECT item_id, SUM(quantity) AS total_qty
         FROM inv_stock_balances
         GROUP BY item_id
       ) b ON b.item_id = i.item_id
       WHERE i.status = 'ACTIVE' AND i.institute_id = $1 AND COALESCE(b.total_qty, 0) <= i.reorder_level`,
      instituteId,
    );
    return rows.map((r) => r.item_id);
  }

  async findOne(instituteId: string, id: number) {
    const item = await this.prisma.invItem.findFirst({
      where: { item_id: id, institute_id: requireInstituteId(instituteId) },
      include: {
        category: true,
        item_vendors: { include: { vendor: { select: { vendor_id: true, name: true } } } },
        balances: { include: { location: { select: { location_id: true, name: true } } } },
      },
    });
    if (!item) throw new NotFoundException(`Item #${id} not found`);
    return item;
  }

  private async assertExists(instituteId: string, id: number) {
    const item = await this.prisma.invItem.findFirst({ where: { item_id: id, institute_id: instituteId } });
    if (!item) throw new NotFoundException(`Item #${id} not found`);
    return item;
  }

  async update(instituteId: string, id: number, dto: UpdateItemDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.assertExists(institute_id, id);

    if (dto.item_code && dto.item_code !== existing.item_code) {
      const clash = await this.prisma.invItem.findFirst({ where: { item_code: dto.item_code, institute_id } });
      if (clash) throw new ConflictException(`Item code "${dto.item_code}" already exists`);
    }
    if (dto.category_id) await this.assertCategoryExists(institute_id, dto.category_id);

    if (dto.image_url !== undefined && dto.image_url !== existing.image_url) {
      await this.files.remove(existing.image_url);
    }

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

  async upsertVendor(instituteId: string, itemId: number, dto: UpsertItemVendorDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    await this.assertExists(institute_id, itemId);
    const vendor = await this.prisma.invVendor.findFirst({ where: { vendor_id: dto.vendor_id, institute_id } });
    if (!vendor) throw new NotFoundException(`Vendor #${dto.vendor_id} not found`);

    const result = await this.prisma.invItemVendor.upsert({
      where: { item_id_vendor_id: { item_id: itemId, vendor_id: dto.vendor_id } },
      update: { last_purchase_price: dto.last_purchase_price },
      create: { item_id: itemId, vendor_id: dto.vendor_id, last_purchase_price: dto.last_purchase_price, institute_id },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.ITEM, entityId: String(itemId), action: 'vendor_associate', metadata: { vendor_id: dto.vendor_id } });
    return result;
  }

  async listVendors(instituteId: string, itemId: number) {
    const institute_id = requireInstituteId(instituteId);
    await this.assertExists(institute_id, itemId);
    return this.prisma.invItemVendor.findMany({
      where: { item_id: itemId },
      include: { vendor: true },
      orderBy: { last_purchase_price: 'asc' },
    });
  }
}
