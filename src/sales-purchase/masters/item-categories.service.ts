import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { SP_ENTITY } from '../common/sales-purchase-entities';
import {
  CreateItemCategoryDto,
  UpdateItemCategoryDto,
} from './dto/item-category.dto';

@Injectable()
export class ItemCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesPurchaseAuditService,
  ) {}

  async create(
    instituteId: string,
    dto: CreateItemCategoryDto,
    actorId?: string,
  ) {
    const existing = await this.prisma.spItemCategory.findUnique({
      where: {
        institute_id_name: { institute_id: instituteId, name: dto.name },
      },
    });
    if (existing)
      throw new ConflictException(`Item category "${dto.name}" already exists`);

    const category = await this.prisma.spItemCategory.create({
      data: { institute_id: instituteId, name: dto.name },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.ITEM_CATEGORY,
      entityId: String(category.category_id),
      action: 'create',
    });
    return category;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.spItemCategory.findMany({
      where: {
        institute_id: instituteId,
        name: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const category = await this.prisma.spItemCategory.findFirst({
      where: { category_id: id, institute_id: instituteId },
    });
    if (!category)
      throw new NotFoundException(`Item category #${id} not found`);
    return category;
  }

  async update(
    instituteId: string,
    id: number,
    dto: UpdateItemCategoryDto,
    actorId?: string,
  ) {
    const existing = await this.findOne(instituteId, id);
    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.spItemCategory.findUnique({
        where: {
          institute_id_name: { institute_id: instituteId, name: dto.name },
        },
      });
      if (clash)
        throw new ConflictException(
          `Item category "${dto.name}" already exists`,
        );
    }

    const updated = await this.prisma.spItemCategory.update({
      where: { category_id: id },
      data: { name: dto.name, status: dto.status },
    });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.ITEM_CATEGORY,
      entityId: String(id),
      action: 'update',
      oldStatus: existing.status,
      newStatus: updated.status,
    });
    return updated;
  }

  /**
   * Hard delete. sp_items.category_id is a non-nullable FK with no
   * onDelete cascade, so this would fail at the database level anyway if
   * items still reference the category — checked explicitly up front so
   * the caller gets a clear 409 instead of a raw Postgres FK error.
   */
  async remove(instituteId: string, id: number, actorId?: string) {
    await this.findOne(instituteId, id);

    const itemCount = await this.prisma.spItem.count({ where: { category_id: id } });
    if (itemCount > 0) {
      throw new ConflictException(
        `Item category #${id} has ${itemCount} item(s) referencing it and cannot be deleted. Reassign or delete those items first.`,
      );
    }

    await this.prisma.spItemCategory.delete({ where: { category_id: id } });
    await this.audit.log({
      userId: actorId,
      entityType: SP_ENTITY.ITEM_CATEGORY,
      entityId: String(id),
      action: 'delete',
    });
    return { success: true };
  }
}
