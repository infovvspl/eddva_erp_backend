import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@ApiTags('Inventory / Asset Maintenance')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  @RequirePermission({ resource: 'assets', action: 'maintain' })
  @ApiOperation({ summary: 'Report a maintenance issue for an asset unit — moves the asset to under_repair' })
  create(@Body() dto: CreateMaintenanceDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.maintenanceService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'assets', action: 'read' })
  @ApiOperation({ summary: 'List/filter maintenance records' })
  @ApiQuery({ name: 'asset_unit_id', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('asset_unit_id') assetUnitId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.maintenanceService.findAll({
      asset_unit_id: assetUnitId ? Number(assetUnitId) : undefined,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission({ resource: 'assets', action: 'read' })
  @ApiOperation({ summary: 'Get a maintenance record' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.maintenanceService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'assets', action: 'maintain' })
  @ApiOperation({ summary: 'Update maintenance status/cost — resolving the last open ticket returns the asset to in_store' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaintenanceDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.maintenanceService.update(id, dto, user.eddva_user_id);
  }
}
