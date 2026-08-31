import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@ApiTags('Inventory / Vendors')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @RequirePermission({ resource: 'vendors', action: 'create' })
  @ApiOperation({ summary: 'Create a vendor' })
  create(@Body() dto: CreateVendorDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.vendorsService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'vendors', action: 'read' })
  @ApiOperation({ summary: 'List/search vendors' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query('search') search?: string) {
    return this.vendorsService.findAll(search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'vendors', action: 'read' })
  @ApiOperation({ summary: 'Get a vendor with its item associations' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Update a vendor (activate/deactivate included)' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVendorDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.vendorsService.update(id, dto, user.eddva_user_id);
  }
}
