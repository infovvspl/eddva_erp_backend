import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { INV_ENTITY } from '../common/inventory-entities';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: InventoryAuditService,
  ) {}

  private async assertParentExists(instituteId: string, parentId: number) {
    const parent = await this.prisma.invCategory.findFirst({ where: { category_id: parentId, institute_id: instituteId } });
    if (!parent) throw new NotFoundException(`Parent category #${parentId} not found`);
  }

  async create(instituteId: string, dto: CreateCategoryDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.prisma.invCategory.findFirst({ where: { name: dto.name, institute_id } });
    if (existing) throw new ConflictException(`Category "${dto.name}" already exists`);
    if (dto.parent_category_id) await this.assertParentExists(institute_id, dto.parent_category_id);

    const category = await this.prisma.invCategory.create({
      data: { name: dto.name, parent_category_id: dto.parent_category_id, institute_id },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.CATEGORY, entityId: String(category.category_id), action: 'create' });
    return category;
  }

  async findAll(instituteId: string, search?: string) {
    return this.prisma.invCategory.findMany({
      where: { institute_id: requireInstituteId(instituteId), ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
      include: { parent: { select: { category_id: true, name: true } }, _count: { select: { items: true, children: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const category = await this.prisma.invCategory.findFirst({
      where: { category_id: id, institute_id: requireInstituteId(instituteId) },
      include: { parent: true, children: true },
    });
    if (!category) throw new NotFoundException(`Category #${id} not found`);
    return category;
  }

  async update(instituteId: string, id: number, dto: UpdateCategoryDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    const existing = await this.findOne(institute_id, id);

    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.invCategory.findFirst({ where: { name: dto.name, institute_id } });
      if (clash) throw new ConflictException(`Category "${dto.name}" already exists`);
    }
    if (dto.parent_category_id) {
      if (dto.parent_category_id === id) throw new ConflictException('A category cannot be its own parent');
      await this.assertParentExists(institute_id, dto.parent_category_id);
    }

    const updated = await this.prisma.invCategory.update({
      where: { category_id: id },
      data: { name: dto.name, parent_category_id: dto.parent_category_id, status: dto.status as any },
    });
    await this.audit.log({ userId: actorId, entityType: INV_ENTITY.CATEGORY, entityId: String(id), action: 'update', oldStatus: existing.status, newStatus: updated.status });
    return updated;
  }
}
