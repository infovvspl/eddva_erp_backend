import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
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
    return this.itemsService.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get('uoms')
  @RequirePermission({ resource: 'items', action: 'read' })
  @ApiOperation({ summary: 'Units of Measure for the item form dropdown (shared with Sales & Purchase)' })
  listUoms(@InventoryUser() user: InventoryPlatformUser) {
    return this.itemsService.listUoms(user.institute_id);
  }

  @Post('upload-image')
  @RequirePermission({ resource: 'items', action: 'create' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload an item photo (JPEG/PNG/WebP, ≤2MB) before/while creating or editing an item' })
  uploadImage(@InventoryUser() user: InventoryPlatformUser, @UploadedFile() file: Express.Multer.File) {
    return this.itemsService.uploadImage(user.institute_id, file);
  }

  @Get('image')
  @RequirePermission({ resource: 'items', action: 'read' })
  @ApiOperation({ summary: 'Download a stored item photo by its stored path' })
  @ApiQuery({ name: 'path', description: 'The relative path returned by upload-image / stored as image_url' })
  getImage(@InventoryUser() user: InventoryPlatformUser, @Query('path') path: string, @Res() res: Response) {
    const absolutePath = this.itemsService.imagePath(user.institute_id, path);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(absolutePath);
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
    @InventoryUser() user: InventoryPlatformUser,
    @Query('search') search?: string,
    @Query('category_id') categoryId?: string,
    @Query('item_type') itemType?: string,
    @Query('low_stock') lowStock?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.itemsService.findAll(user.institute_id, {
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
  findOne(@InventoryUser() user: InventoryPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.itemsService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'items', action: 'update' })
  @ApiOperation({ summary: 'Update an item master record' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.itemsService.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/vendors')
  @RequirePermission({ resource: 'items', action: 'update' })
  @ApiOperation({ summary: 'Associate a vendor with an item (and its last purchase price)' })
  @ApiParam({ name: 'id', example: 1 })
  upsertVendor(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertItemVendorDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.itemsService.upsertVendor(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Get(':id/vendors')
  @RequirePermission({ resource: 'items', action: 'read' })
  @ApiOperation({ summary: 'List vendors associated with an item, cheapest last-purchase-price first' })
  @ApiParam({ name: 'id', example: 1 })
  listVendors(@InventoryUser() user: InventoryPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.itemsService.listVendors(user.institute_id, id);
  }
}
