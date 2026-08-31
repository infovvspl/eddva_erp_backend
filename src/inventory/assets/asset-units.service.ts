import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { UpdateAssetUnitDto } from './dto/update-asset-unit.dto';

const ASSET_DETAIL_INCLUDE = {
  item: { select: { item_id: true, name: true, item_code: true, image_url: true } },
  current_location: { select: { location_id: true, name: true } },
  current_holder: { select: { holder_id: true, name: true, holder_type: true } },
  purchase: { select: { purchase_id: true, purchase_date: true, unit_price: true, vendor_id: true } },
} as const;

@Injectable()
export class AssetUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  async findAll(params: { item_id?: number; location_id?: number; holder_id?: number; status?: string; search?: string; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 25;

    const where: any = {};
    if (params.item_id) where.item_id = params.item_id;
    if (params.location_id) where.current_location_id = params.location_id;
    if (params.holder_id) where.current_holder_id = params.holder_id;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { asset_tag: { contains: params.search, mode: 'insensitive' } },
        { serial_number: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invAssetUnit.findMany({
        where,
        include: ASSET_DETAIL_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invAssetUnit.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Barcode/QR scan lookup. Returns everything a front-desk/store scanning
   * workflow needs in one call: item, current location, current holder, and
   * open maintenance state.
   */
  async findByTag(tag: string) {
    const asset = await this.prisma.invAssetUnit.findUnique({
      where: { asset_tag: tag },
      include: {
        ...ASSET_DETAIL_INCLUDE,
        maintenance: { orderBy: { created_at: 'desc' }, take: 5 },
        issues: {
          where: { status: { in: ['issued', 'partially_returned'] } },
          include: { holder: { select: { holder_id: true, name: true, holder_type: true } } },
          take: 1,
        },
      },
    });
    if (!asset) throw new NotFoundException(`Asset with tag "${tag}" not found`);
    return asset;
  }

  private async assertExistsByTag(tag: string) {
    const asset = await this.prisma.invAssetUnit.findUnique({ where: { asset_tag: tag } });
    if (!asset) throw new NotFoundException(`Asset with tag "${tag}" not found`);
    return asset;
  }

  async update(tag: string, dto: UpdateAssetUnitDto, actorId?: string) {
    const existing = await this.assertExistsByTag(tag);

    if (dto.current_location_id) {
      const location = await this.prisma.invLocation.findUnique({ where: { location_id: dto.current_location_id } });
      if (!location) throw new NotFoundException(`Location #${dto.current_location_id} not found`);
    }
    if (dto.status === 'issued' || existing.status === 'issued') {
      // Issued/un-issued transitions must go through /issues and /issues/:id/return
      // so stock ledger + holder linkage stay consistent — block direct edits here.
      if (dto.status && dto.status !== existing.status) {
        throw new ConflictException('Use the issue/return workflow to change an asset in or out of "issued" status');
      }
    }

    const updated = await this.prisma.invAssetUnit.update({
      where: { asset_tag: tag },
      data: {
        serial_number: dto.serial_number,
        status: dto.status as any,
        current_location_id: dto.current_location_id,
        warranty_expiry: dto.warranty_expiry ? new Date(dto.warranty_expiry) : undefined,
      },
      include: ASSET_DETAIL_INCLUDE,
    });

    await this.audit.log({
      userId: actorId,
      entityType: INV_ENTITY.ASSET_UNIT,
      entityId: String(existing.asset_unit_id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }
}
