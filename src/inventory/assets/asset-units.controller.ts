import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { AssetUnitsService } from './asset-units.service';
import { UpdateAssetUnitDto } from './dto/update-asset-unit.dto';

@ApiTags('Inventory / Assets')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/assets')
export class AssetUnitsController {
  constructor(private readonly assetUnitsService: AssetUnitsService) {}

  @Get()
  @RequirePermission({ resource: 'assets', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter individually tracked asset units' })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'location_id', required: false })
  @ApiQuery({ name: 'holder_id', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Matches asset_tag or serial_number' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('item_id') itemId?: string,
    @Query('location_id') locationId?: string,
    @Query('holder_id') holderId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assetUnitsService.findAll({
      item_id: itemId ? Number(itemId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      holder_id: holderId ? Number(holderId) : undefined,
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':tag')
  @RequirePermission({ resource: 'assets', action: 'read' })
  @ApiOperation({ summary: 'Look up an asset by its unique tag/barcode — the primary barcode/QR scanning workflow endpoint' })
  @ApiParam({ name: 'tag', example: 'LAPTOP-0001' })
  findByTag(@Param('tag') tag: string) {
    return this.assetUnitsService.findByTag(tag);
  }

  @Patch(':tag')
  @RequirePermission({ resource: 'assets', action: 'update' })
  @ApiOperation({ summary: 'Update an asset unit (serial number, location, warranty, or a direct status override outside the issue/return flow)' })
  @ApiParam({ name: 'tag', example: 'LAPTOP-0001' })
  update(@Param('tag') tag: string, @Body() dto: UpdateAssetUnitDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.assetUnitsService.update(tag, dto, user.eddva_user_id);
  }
}
