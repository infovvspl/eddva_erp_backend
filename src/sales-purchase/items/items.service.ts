import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, SpItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  buildMeta,
  parsePagination,
  parseSortOrder,
} from '../common/pagination.util';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemDto } from './dto/query-item.dto';

const ITEM_SORT_FIELDS = ['item_name', 'item_code', 'created_at'] as const;

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  private async assertRelationsExist(
    instituteId: string,
    dto: { category_id?: number; uom_id?: number; tax_code_id?: number },
  ) {
    if (dto.category_id) {
      const category = await this.prisma.spItemCategory.findFirst({
        where: { category_id: dto.category_id, institute_id: instituteId },
      });
      if (!category)
        throw new NotFoundException(
          `Item category #${dto.category_id} not found`,
        );
    }
    if (dto.uom_id) {
      const uom = await this.prisma.spUom.findFirst({
        where: { uom_id: dto.uom_id, institute_id: instituteId },
      });
      if (!uom) throw new NotFoundException(`UOM #${dto.uom_id} not found`);
    }
    if (dto.tax_code_id) {
      const taxCode = await this.prisma.spTaxCode.findFirst({
        where: { tax_code_id: dto.tax_code_id, institute_id: instituteId },
      });
      if (!taxCode)
        throw new NotFoundException(`Tax code #${dto.tax_code_id} not found`);
    }
  }

  async create(instituteId: string, dto: CreateItemDto, actorId?: string) {
    await this.assertRelationsExist(instituteId, dto);

    const item_code = await this.numbering.generateNextCode(
      DocumentType.SP_ITEM,
      'IT/',
    );
    const item = await this.prisma.spItem.create({
      data: {
        institute_id: instituteId,
        item_code,
        item_name: dto.item_name,
        category_id: dto.category_id,
        uom_id: dto.uom_id,
        hsn_sac_code: dto.hsn_sac_code,
        purchase_price: dto.purchase_price ?? 0,
        sales_price: dto.sales_price ?? 0,
        tax_code_id: dto.tax_code_id,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.ITEM,
      entityId: String(item.item_id),
      action: 'create',
    });
    return item;
  }

  async findAll(instituteId: string, query: QueryItemDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const sortBy = ITEM_SORT_FIELDS.includes(query.sortBy as any)
      ? (query.sortBy as (typeof ITEM_SORT_FIELDS)[number])
      : 'item_name';
    const sortOrder = parseSortOrder(query.sortOrder);

    const where = {
      institute_id: instituteId,
      status: query.status,
      category_id: query.category_id,
      OR: query.search
        ? [
            {
              item_name: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
            {
              item_code: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.spItem.findMany({
        where,
        include: {
          category: { select: { name: true } },
          uom: { select: { name: true, symbol: true } },
          tax_code: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      this.prisma.spItem.count({ where }),
    ]);

    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const item = await this.prisma.spItem.findFirst({
      where: { item_id: id, institute_id: instituteId },
      include: { category: true, uom: true, tax_code: true },
    });
    if (!item) throw new NotFoundException(`Item #${id} not found`);
    return item;
  }

  /** Used by PO/SO item creation — inactive items cannot be added to new transactions (module spec §13). */
  async assertActiveItem(instituteId: string, id: number) {
    const item = await this.prisma.spItem.findFirst({
      where: { item_id: id, institute_id: instituteId },
    });
    if (!item) throw new NotFoundException(`Item #${id} not found`);
    if (item.status !== SpItemStatus.ACTIVE) {
      throw new BadRequestException(
        `Item "${item.item_name}" is inactive and cannot be used in new transactions`,
      );
    }
    return item;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateItemDto,
    actorId?: string,
  ) {
    const existing = await this.findOne(instituteId, id);
    await this.assertRelationsExist(instituteId, dto);

    const updated = await this.prisma.spItem.update({
      where: { item_id: id },
      data: {
        item_name: dto.item_name,
        category_id: dto.category_id,
        uom_id: dto.uom_id,
        hsn_sac_code: dto.hsn_sac_code,
        purchase_price: dto.purchase_price,
        sales_price: dto.sales_price,
        tax_code_id: dto.tax_code_id,
        status: dto.status,
      },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.ITEM,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /** Items are never hard-deleted — historical PO/GRN/invoice lines keep referencing them. Deactivate instead. */
  async remove(instituteId: string, id: number, actorId?: string) {
    const existing = await this.findOne(instituteId, id);
    const updated = await this.prisma.spItem.update({
      where: { item_id: id },
      data: { status: SpItemStatus.INACTIVE },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.ITEM,
      entityId: String(id),
      action: 'delete',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }
}
