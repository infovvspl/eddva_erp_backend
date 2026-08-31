import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@ApiTags('Inventory / Locations')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @RequirePermission({ resource: 'locations', action: 'create' })
  @ApiOperation({ summary: 'Create a physical inventory location (store/department/classroom/lab)' })
  create(@Body() dto: CreateLocationDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.locationsService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'locations', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter locations' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false })
  findAll(@Query('search') search?: string, @Query('type') type?: string) {
    return this.locationsService.findAll(search, type);
  }

  @Get(':id')
  @RequirePermission({ resource: 'locations', action: 'read' })
  @ApiOperation({ summary: 'Get a location' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'locations', action: 'update' })
  @ApiOperation({ summary: 'Update a location (rename, retype, activate/deactivate)' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.locationsService.update(id, dto, user.eddva_user_id);
  }
}
