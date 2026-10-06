import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CanteenMenuService } from './canteen-menu.service';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateItemAvailabilityDto } from './dto/update-item-availability.dto';
import { CreateMenuScheduleDto } from './dto/create-menu-schedule.dto';
import { UpdateMenuScheduleDto } from './dto/update-menu-schedule.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { CanteenFoodType } from '@prisma/client';

@ApiTags('Canteen Menu Management')
@ApiBearerAuth()
@UseGuards(
  CanteenJwtGuard,
  CanteenInstituteAdminViewOnlyGuard,
  CanteenPermissionsGuard,
)
@Controller('api/canteen/menu')
export class CanteenMenuController {
  constructor(private readonly menuService: CanteenMenuService) {}

  // --- Categories ---
  @ApiOperation({ summary: 'Create menu category' })
  @RequirePermission({ resource: 'menu_categories', action: 'create' })
  @Post('categories')
  async createCategory(@Body() dto: CreateMenuCategoryDto, @CanteenUser() user: CanteenPlatformUser) {
    return this.menuService.createCategory(user.institute_id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List menu categories' })
  @RequirePermission({ resource: 'menu_categories', action: 'read' })
  @Get('categories')
  async getCategories(@CanteenUser() user: CanteenPlatformUser) {
    return this.menuService.getCategories(user.institute_id);
  }

  @ApiOperation({ summary: 'Get menu category by ID' })
  @RequirePermission({ resource: 'menu_categories', action: 'read' })
  @Get('categories/:id')
  async getCategoryById(@CanteenUser() user: CanteenPlatformUser, @Param('id') id: string) {
    return this.menuService.getCategoryById(user.institute_id, id);
  }

  @ApiOperation({ summary: 'Update menu category' })
  @RequirePermission({ resource: 'menu_categories', action: 'update' })
  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateMenuCategoryDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.menuService.updateCategory(user.institute_id, id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Delete menu category' })
  @RequirePermission({ resource: 'menu_categories', action: 'delete' })
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.menuService.deleteCategory(user.institute_id, id, user.eddva_user_id);
  }

  // --- Items ---
  @ApiOperation({ summary: 'Create menu item' })
  @RequirePermission({ resource: 'menu_items', action: 'create' })
  @Post('items')
  async createItem(@Body() dto: CreateMenuItemDto, @CanteenUser() user: CanteenPlatformUser) {
    return this.menuService.createItem(user.institute_id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List menu items (with search, filtering, pagination)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'foodType', enum: CanteenFoodType, required: false })
  @ApiQuery({ name: 'isAvailable', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @RequirePermission({ resource: 'menu_items', action: 'read' })
  @Get('items')
  async getItems(
    @CanteenUser() user: CanteenPlatformUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('foodType') foodType?: CanteenFoodType,
    @Query('isAvailable') isAvailable?: boolean,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('sort') sort?: string,
  ) {
    return this.menuService.getItems(user.institute_id, {
      page,
      limit,
      search,
      categoryId,
      foodType,
      isAvailable,
      minPrice,
      maxPrice,
      sort,
    });
  }

  @ApiOperation({ summary: 'Get menu item by ID' })
  @RequirePermission({ resource: 'menu_items', action: 'read' })
  @Get('items/:id')
  async getItemById(@CanteenUser() user: CanteenPlatformUser, @Param('id') id: string) {
    return this.menuService.getItemById(user.institute_id, id);
  }

  @ApiOperation({ summary: 'Update menu item' })
  @RequirePermission({ resource: 'menu_items', action: 'update' })
  @Patch('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.menuService.updateItem(user.institute_id, id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Toggle item availability' })
  @RequirePermission({ resource: 'menu_items', action: 'availability' })
  @Patch('items/:id/availability')
  async toggleAvailability(
    @Param('id') id: string,
    @Body() dto: UpdateItemAvailabilityDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.menuService.toggleAvailability(user.institute_id, id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Delete menu item' })
  @RequirePermission({ resource: 'menu_items', action: 'delete' })
  @Delete('items/:id')
  async deleteItem(@Param('id') id: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.menuService.deleteItem(user.institute_id, id, user.eddva_user_id);
  }

  // --- Schedules ---
  @ApiOperation({ summary: 'Create menu schedule for item' })
  @RequirePermission({ resource: 'menu_schedules', action: 'create' })
  @Post('items/:itemId/schedules')
  async createSchedule(
    @Param('itemId') itemId: string,
    @Body() dto: CreateMenuScheduleDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.menuService.createSchedule(user.institute_id, itemId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List schedules for menu item' })
  @RequirePermission({ resource: 'menu_schedules', action: 'read' })
  @Get('items/:itemId/schedules')
  async getSchedulesByItem(@CanteenUser() user: CanteenPlatformUser, @Param('itemId') itemId: string) {
    return this.menuService.getSchedulesByItem(user.institute_id, itemId);
  }

  @ApiOperation({ summary: 'Get menu schedule by ID' })
  @RequirePermission({ resource: 'menu_schedules', action: 'read' })
  @Get('schedules/:id')
  async getScheduleById(@CanteenUser() user: CanteenPlatformUser, @Param('id') id: string) {
    return this.menuService.getScheduleById(user.institute_id, id);
  }

  @ApiOperation({ summary: 'Update menu schedule' })
  @RequirePermission({ resource: 'menu_schedules', action: 'update' })
  @Patch('schedules/:id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateMenuScheduleDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.menuService.updateSchedule(user.institute_id, id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Delete menu schedule' })
  @RequirePermission({ resource: 'menu_schedules', action: 'delete' })
  @Delete('schedules/:id')
  async deleteSchedule(@Param('id') id: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.menuService.deleteSchedule(user.institute_id, id, user.eddva_user_id);
  }
}
