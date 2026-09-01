import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@ApiTags('Transport / Vehicles')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Create a vehicle' })
  create(@Body() dto: CreateVehicleDto, @TransportUser() user: TransportPlatformUser) {
    return this.vehiclesService.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'List/search vehicles' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@TransportUser() user: TransportPlatformUser, @Query('search') search?: string) {
    return this.vehiclesService.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'Get a vehicle' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.vehiclesService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Update a vehicle' })
  @ApiParam({ name: 'id', example: 1 })
  update(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Delete a vehicle (blocked if it has route/GPS/maintenance history — deactivate instead)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.vehiclesService.remove(user.institute_id, id, user.eddva_user_id);
  }
}
