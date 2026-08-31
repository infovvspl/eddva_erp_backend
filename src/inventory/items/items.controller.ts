import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpsertItemVendorDto } from './dto/upsert-item-vendor.dto';

@ApiTags('Inventory / Items')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @RequirePermission({ resource: 'items', action: 'create' })
  @ApiOperation({ summary: 'Create an item master record' })
  create(@Body() dto: CreateItemDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.itemsService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'items', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter items, including low-stock filtering' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category_id', required: false })
  @ApiQuery({ name: 'item_type', required: false, enum: ['consumable', 'asset'] })
  @ApiQuery({ name: 'low_stock', required: false, description: 'true to return only items at/below reorder_level' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('search') search?: string,
    @Query('category_id') categoryId?: string,
    @Query('item_type') itemType?: string,
    @Query('low_stock') lowStock?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.itemsService.findAll({
      search,
      category_id: categoryId ? Number(categoryId) : undefined,
      item_type: itemType,
      low_stock: lowStock === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission({ resource: 'items', action: 'read' })
  @ApiOperation({ summary: 'Get item details, vendor associations, and per-location balances' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'items', action: 'update' })
  @ApiOperation({ summary: 'Update an item master record' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.itemsService.update(id, dto, user.eddva_user_id);
  }

  @Post(':id/vendors')
  @RequirePermission({ resource: 'items', action: 'update' })
  @ApiOperation({ summary: 'Associate a vendor with an item (and its last purchase price)' })
  @ApiParam({ name: 'id', example: 1 })
  upsertVendor(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertItemVendorDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.itemsService.upsertVendor(id, dto, user.eddva_user_id);
  }

  @Get(':id/vendors')
  @RequirePermission({ resource: 'items', action: 'read' })
  @ApiOperation({ summary: 'List vendors associated with an item, cheapest last-purchase-price first' })
  @ApiParam({ name: 'id', example: 1 })
  listVendors(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.listVendors(id);
  }
}
