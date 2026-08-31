import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
    private readonly ledger: InventoryStockLedgerService,
  ) {}

  async create(dto: CreatePurchaseDto, actorId?: string) {
    const item = await this.prisma.invItem.findUnique({ where: { item_id: dto.item_id } });
    if (!item) throw new NotFoundException(`Item #${dto.item_id} not found`);

    const vendor = await this.prisma.invVendor.findUnique({ where: { vendor_id: dto.vendor_id } });
    if (!vendor) throw new NotFoundException(`Vendor #${dto.vendor_id} not found`);

    const location = await this.prisma.invLocation.findUnique({ where: { location_id: dto.location_id } });
    if (!location) throw new NotFoundException(`Location #${dto.location_id} not found`);

    if (item.item_type === 'asset') {
      if (dto.asset_tags && dto.asset_tags.length !== dto.quantity) {
        throw new BadRequestException(`asset_tags must contain exactly ${dto.quantity} tag(s) to match quantity`);
      }
      if (dto.asset_tags) {
        const duplicates = await this.prisma.invAssetUnit.findMany({ where: { asset_tag: { in: dto.asset_tags } } });
        if (duplicates.length > 0) {
          throw new ConflictException(`Asset tag(s) already in use: ${duplicates.map((d) => d.asset_tag).join(', ')}`);
        }
      }
    }

    const total_amount = Number((dto.quantity * dto.unit_price).toFixed(2));

    const result = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.invStockPurchase.create({
        data: {
          item_id: dto.item_id,
          vendor_id: dto.vendor_id,
          location_id: dto.location_id,
          quantity: dto.quantity,
          unit_price: dto.unit_price,
          total_amount,
          invoice_number: dto.invoice_number,
          purchase_date: new Date(dto.purchase_date),
          created_by: actorId,
        },
      });

      await this.ledger.increment(tx, 'purchase_in', {
        item_id: dto.item_id,
        location_id: dto.location_id,
        quantity: dto.quantity,
        reference_type: 'purchase',
        reference_id: purchase.purchase_id,
        purchase_id: purchase.purchase_id,
        created_by: actorId,
      });

      await tx.invItemVendor.upsert({
        where: { item_id_vendor_id: { item_id: dto.item_id, vendor_id: dto.vendor_id } },
        update: { last_purchase_price: dto.unit_price },
        create: { item_id: dto.item_id, vendor_id: dto.vendor_id, last_purchase_price: dto.unit_price },
      });

      let assetUnits: any[] = [];
      if (item.item_type === 'asset') {
        const existingCount = await tx.invAssetUnit.count({ where: { item_id: dto.item_id } });
        const tags = dto.asset_tags ?? Array.from({ length: dto.quantity }, (_, i) =>
          `${item.item_code}-${String(existingCount + i + 1).padStart(4, '0')}`,
        );
        assetUnits = await Promise.all(
          tags.map((asset_tag) =>
            tx.invAssetUnit.create({
              data: {
                item_id: dto.item_id,
                asset_tag,
                purchase_id: purchase.purchase_id,
                current_location_id: dto.location_id,
                status: 'in_store',
                purchase_date: new Date(dto.purchase_date),
              },
            }),
          ),
        );
      }

      return { purchase, assetUnits };
    });

    await this.audit.log({
      userId: actorId,
      entityType: INV_ENTITY.PURCHASE,
      entityId: String(result.purchase.purchase_id),
      action: 'create',
      metadata: { item_id: dto.item_id, vendor_id: dto.vendor_id, location_id: dto.location_id, quantity: dto.quantity, total_amount },
    });

    return { ...result.purchase, asset_units: result.assetUnits };
  }

  async findAll(params: { vendor_id?: number; item_id?: number; location_id?: number; date_from?: string; date_to?: string; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.vendor_id) where.vendor_id = params.vendor_id;
    if (params.item_id) where.item_id = params.item_id;
    if (params.location_id) where.location_id = params.location_id;
    if (params.date_from || params.date_to) {
      where.purchase_date = {};
      if (params.date_from) where.purchase_date.gte = new Date(params.date_from);
      if (params.date_to) where.purchase_date.lte = new Date(params.date_to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invStockPurchase.findMany({
        where,
        include: {
          item: { select: { item_id: true, name: true, item_code: true } },
          vendor: { select: { vendor_id: true, name: true } },
          location: { select: { location_id: true, name: true } },
        },
        orderBy: { purchase_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invStockPurchase.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const purchase = await this.prisma.invStockPurchase.findUnique({
      where: { purchase_id: id },
      include: { item: true, vendor: true, location: true, asset_units: true },
    });
    if (!purchase) throw new NotFoundException(`Purchase #${id} not found`);
    return purchase;
  }
}
