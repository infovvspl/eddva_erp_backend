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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CanteenPermissionsGuard } from '../guards/canteen-permissions.guard';
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { CanteenFoodType } from '@prisma/client';

@ApiTags('Canteen Menu Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanteenPermissionsGuard)
@Controller('api/canteen/menu')
export class CanteenMenuController {
  constructor(private readonly menuService: CanteenMenuService) {}

  // --- Categories ---
  @ApiOperation({ summary: 'Create menu category' })
  @RequireCanteenPermission('canteen.category.create')
  @Post('categories')
  async createCategory(@Body() dto: CreateMenuCategoryDto, @GetUser() user: any) {
    return this.menuService.createCategory(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List menu categories' })
  @RequireCanteenPermission('canteen.category.view')
  @Get('categories')
  async getCategories() {
    return this.menuService.getCategories();
  }

  @ApiOperation({ summary: 'Get menu category by ID' })
  @RequireCanteenPermission('canteen.category.view')
  @Get('categories/:id')
  async getCategoryById(@Param('id') id: string) {
    return this.menuService.getCategoryById(id);
  }

  @ApiOperation({ summary: 'Update menu category' })
  @RequireCanteenPermission('canteen.category.update')
  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateMenuCategoryDto,
    @GetUser() user: any,
  ) {
    return this.menuService.updateCategory(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Delete menu category' })
  @RequireCanteenPermission('canteen.category.delete')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string, @GetUser() user: any) {
    return this.menuService.deleteCategory(id, user?.id || user?.userId);
  }

  // --- Items ---
  @ApiOperation({ summary: 'Create menu item' })
  @RequireCanteenPermission('canteen.item.create')
  @Post('items')
  async createItem(@Body() dto: CreateMenuItemDto, @GetUser() user: any) {
    return this.menuService.createItem(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List menu items (with search, filtering, pagination)' })
  @RequireCanteenPermission('canteen.item.view')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'foodType', enum: CanteenFoodType, required: false })
  @ApiQuery({ name: 'isAvailable', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @Get('items')
  async getItems(
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
    return this.menuService.getItems({
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
  @RequireCanteenPermission('canteen.item.view')
  @Get('items/:id')
  async getItemById(@Param('id') id: string) {
    return this.menuService.getItemById(id);
  }

  @ApiOperation({ summary: 'Update menu item' })
  @RequireCanteenPermission('canteen.item.update')
  @Patch('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
    @GetUser() user: any,
  ) {
    return this.menuService.updateItem(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Toggle item availability' })
  @RequireCanteenPermission('canteen.item.availability')
  @Patch('items/:id/availability')
  async toggleAvailability(
    @Param('id') id: string,
    @Body() dto: UpdateItemAvailabilityDto,
    @GetUser() user: any,
  ) {
    return this.menuService.toggleAvailability(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Delete menu item' })
  @RequireCanteenPermission('canteen.item.delete')
  @Delete('items/:id')
  async deleteItem(@Param('id') id: string, @GetUser() user: any) {
    return this.menuService.deleteItem(id, user?.id || user?.userId);
  }

  // --- Schedules ---
  @ApiOperation({ summary: 'Create menu schedule for item' })
  @RequireCanteenPermission('canteen.schedule.create')
  @Post('items/:itemId/schedules')
  async createSchedule(
    @Param('itemId') itemId: string,
    @Body() dto: CreateMenuScheduleDto,
    @GetUser() user: any,
  ) {
    return this.menuService.createSchedule(itemId, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List schedules for menu item' })
  @RequireCanteenPermission('canteen.schedule.view')
  @Get('items/:itemId/schedules')
  async getSchedulesByItem(@Param('itemId') itemId: string) {
    return this.menuService.getSchedulesByItem(itemId);
  }

  @ApiOperation({ summary: 'Get menu schedule by ID' })
  @RequireCanteenPermission('canteen.schedule.view')
  @Get('schedules/:id')
  async getScheduleById(@Param('id') id: string) {
    return this.menuService.getScheduleById(id);
  }

  @ApiOperation({ summary: 'Update menu schedule' })
  @RequireCanteenPermission('canteen.schedule.update')
  @Patch('schedules/:id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateMenuScheduleDto,
    @GetUser() user: any,
  ) {
    return this.menuService.updateSchedule(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Delete menu schedule' })
  @RequireCanteenPermission('canteen.schedule.delete')
  @Delete('schedules/:id')
  async deleteSchedule(@Param('id') id: string, @GetUser() user: any) {
    return this.menuService.deleteSchedule(id, user?.id || user?.userId);
  }
}
