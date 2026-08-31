import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Inventory / Categories')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission({ resource: 'categories', action: 'create' })
  @ApiOperation({ summary: 'Create an item category (optionally as a sub-category)' })
  create(@Body() dto: CreateCategoryDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.categoriesService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'categories', action: 'read' })
  @ApiOperation({ summary: 'List/search categories' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query('search') search?: string) {
    return this.categoriesService.findAll(search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'categories', action: 'read' })
  @ApiOperation({ summary: 'Get a category with its parent and sub-categories' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'categories', action: 'update' })
  @ApiOperation({ summary: 'Update a category (rename, re-parent, activate/deactivate)' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.categoriesService.update(id, dto, user.eddva_user_id);
  }
}
