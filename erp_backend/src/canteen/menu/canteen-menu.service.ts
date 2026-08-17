import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateItemAvailabilityDto } from './dto/update-item-availability.dto';
import { CreateMenuScheduleDto } from './dto/create-menu-schedule.dto';
import { UpdateMenuScheduleDto } from './dto/update-menu-schedule.dto';
import { CanteenFoodType } from '@prisma/client';

@Injectable()
export class CanteenMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // --- Categories ---
  async getCategories() {
    return this.prisma.canteenMenuCategory.findMany({
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getCategoryById(id: string) {
    const category = await this.prisma.canteenMenuCategory.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!category) {
      throw new NotFoundException('Menu category not found.');
    }
    return category;
  }

  async createCategory(dto: CreateMenuCategoryDto, actorUserId?: string) {
    const existing = await this.prisma.canteenMenuCategory.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Category '${dto.name}' already exists.`);
    }

    const category = await this.prisma.canteenMenuCategory.create({
      data: {
        name: dto.name,
        displayOrder: dto.displayOrder ?? 0,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuCategory',
      entityId: category.id,
      action: 'Canteen Category Created',
      metadata: { name: category.name },
    });

    return category;
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto, actorUserId?: string) {
    const category = await this.getCategoryById(id);

    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.canteenMenuCategory.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`Category '${dto.name}' already exists.`);
      }
    }

    const updated = await this.prisma.canteenMenuCategory.update({
      where: { id },
      data: {
        name: dto.name ?? category.name,
        displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : category.displayOrder,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuCategory',
      entityId: id,
      action: 'Canteen Category Updated',
      metadata: { name: updated.name },
    });

    return updated;
  }

  async deleteCategory(id: string, actorUserId?: string) {
    const category = await this.prisma.canteenMenuCategory.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!category) {
      throw new NotFoundException('Menu category not found.');
    }

    if (category.items.length > 0) {
      throw new BadRequestException(
        `Cannot delete category '${category.name}' because it contains ${category.items.length} menu item(s). Remove or reassign the items first.`,
      );
    }

    await this.prisma.canteenMenuCategory.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuCategory',
      entityId: id,
      action: 'Canteen Category Deleted',
      metadata: { name: category.name },
    });

    return { message: `Category '${category.name}' deleted successfully.` };
  }

  // --- Menu Items ---
  async getItems(params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    foodType?: CanteenFoodType;
    isAvailable?: boolean;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    if (params.foodType) {
      where.foodType = params.foodType;
    }

    if (params.isAvailable !== undefined) {
      where.isAvailable = String(params.isAvailable) === 'true' || params.isAvailable === true;
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.price = {};
      if (params.minPrice !== undefined) where.price.gte = Number(params.minPrice);
      if (params.maxPrice !== undefined) where.price.lte = Number(params.maxPrice);
    }

    const orderBy: any = {};
    if (params.sort) {
      const [field, direction] = params.sort.split(':');
      orderBy[field] = direction?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.name = 'asc';
    }

    const [total, data] = await Promise.all([
      this.prisma.canteenMenuItem.count({ where }),
      this.prisma.canteenMenuItem.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: true,
          schedules: true,
        },
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getItemById(id: string) {
    const item = await this.prisma.canteenMenuItem.findUnique({
      where: { id },
      include: {
        category: true,
        schedules: true,
      },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found.');
    }
    return item;
  }

  async createItem(dto: CreateMenuItemDto, actorUserId?: string) {
    await this.getCategoryById(dto.categoryId);

    const item = await this.prisma.canteenMenuItem.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description || null,
        price: dto.price,
        taxRate: dto.taxRate ?? 0,
        foodType: dto.foodType ?? CanteenFoodType.VEG,
        imageUrl: dto.imageUrl || null,
        isAvailable: dto.isAvailable ?? true,
        availableDays: dto.availableDays || null,
      },
      include: { category: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuItem',
      entityId: item.id,
      action: 'Canteen Menu Item Created',
      metadata: { name: item.name, price: item.price },
    });

    return item;
  }

  async updateItem(id: string, dto: UpdateMenuItemDto, actorUserId?: string) {
    const item = await this.getItemById(id);

    if (dto.categoryId && dto.categoryId !== item.categoryId) {
      await this.getCategoryById(dto.categoryId);
    }

    const updated = await this.prisma.canteenMenuItem.update({
      where: { id },
      data: {
        categoryId: dto.categoryId ?? item.categoryId,
        name: dto.name ?? item.name,
        description: dto.description !== undefined ? dto.description : item.description,
        price: dto.price !== undefined ? dto.price : item.price,
        taxRate: dto.taxRate !== undefined ? dto.taxRate : item.taxRate,
        foodType: dto.foodType ?? item.foodType,
        imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : item.imageUrl,
        isAvailable: dto.isAvailable !== undefined ? dto.isAvailable : item.isAvailable,
        availableDays: dto.availableDays !== undefined ? dto.availableDays : item.availableDays,
      },
      include: { category: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuItem',
      entityId: id,
      action: 'Canteen Menu Item Updated',
      metadata: { name: updated.name, price: updated.price },
    });

    return updated;
  }

  async toggleAvailability(id: string, dto: UpdateItemAvailabilityDto, actorUserId?: string) {
    const item = await this.getItemById(id);

    const updated = await this.prisma.canteenMenuItem.update({
      where: { id },
      data: { isAvailable: dto.isAvailable },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuItem',
      entityId: id,
      action: 'Canteen Item Availability Updated',
      oldStatus: String(item.isAvailable),
      newStatus: String(dto.isAvailable),
      metadata: { name: item.name },
    });

    return updated;
  }

  async deleteItem(id: string, actorUserId?: string) {
    const item = await this.prisma.canteenMenuItem.findUnique({
      where: { id },
      include: { orderItems: true },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found.');
    }

    if (item.orderItems.length > 0) {
      // Soft delete/disable to preserve historical order logs
      const updated = await this.prisma.canteenMenuItem.update({
        where: { id },
        data: { isAvailable: false },
      });

      await this.auditService.log({
        userId: actorUserId,
        entityType: 'CanteenMenuItem',
        entityId: id,
        action: 'Canteen Menu Item Disabled (Soft Deleted)',
        metadata: { name: item.name, orderCount: item.orderItems.length },
      });

      return {
        message: `Item '${item.name}' has existing orders and was marked unavailable instead of deletion.`,
        item: updated,
      };
    }

    await this.prisma.canteenMenuSchedule.deleteMany({ where: { itemId: id } });
    await this.prisma.canteenMenuItem.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuItem',
      entityId: id,
      action: 'Canteen Menu Item Deleted',
      metadata: { name: item.name },
    });

    return { message: `Menu item '${item.name}' deleted successfully.` };
  }

  // --- Schedules ---
  async getSchedulesByItem(itemId: string) {
    await this.getItemById(itemId);
    return this.prisma.canteenMenuSchedule.findMany({
      where: { itemId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async getScheduleById(id: string) {
    const schedule = await this.prisma.canteenMenuSchedule.findUnique({
      where: { id },
      include: { item: true },
    });
    if (!schedule) {
      throw new NotFoundException('Menu schedule not found.');
    }
    return schedule;
  }

  async createSchedule(itemId: string, dto: CreateMenuScheduleDto, actorUserId?: string) {
    await this.getItemById(itemId);

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime must be strictly before endTime.');
    }

    const schedule = await this.prisma.canteenMenuSchedule.create({
      data: {
        itemId,
        dayOfWeek: dto.dayOfWeek.toUpperCase(),
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuSchedule',
      entityId: schedule.id,
      action: 'Canteen Schedule Created',
      metadata: { itemId, dayOfWeek: schedule.dayOfWeek, time: `${schedule.startTime}-${schedule.endTime}` },
    });

    return schedule;
  }

  async updateSchedule(id: string, dto: UpdateMenuScheduleDto, actorUserId?: string) {
    const schedule = await this.getScheduleById(id);

    const startTime = dto.startTime ?? schedule.startTime;
    const endTime = dto.endTime ?? schedule.endTime;

    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be strictly before endTime.');
    }

    const updated = await this.prisma.canteenMenuSchedule.update({
      where: { id },
      data: {
        dayOfWeek: dto.dayOfWeek ? dto.dayOfWeek.toUpperCase() : schedule.dayOfWeek,
        startTime,
        endTime,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuSchedule',
      entityId: id,
      action: 'Canteen Schedule Updated',
      metadata: { dayOfWeek: updated.dayOfWeek },
    });

    return updated;
  }

  async deleteSchedule(id: string, actorUserId?: string) {
    const schedule = await this.getScheduleById(id);

    await this.prisma.canteenMenuSchedule.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenMenuSchedule',
      entityId: id,
      action: 'Canteen Schedule Deleted',
    });

    return { message: 'Schedule deleted successfully.' };
  }
}
