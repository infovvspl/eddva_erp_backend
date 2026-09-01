import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { AssignVehicleToDriverDto } from './dto/assign-vehicle-to-driver.dto';

@ApiTags('Transport / Drivers')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @RequirePermission({ resource: 'drivers', action: 'manage' })
  @ApiOperation({ summary: 'Create a driver' })
  create(@Body() dto: CreateDriverDto, @TransportUser() user: TransportPlatformUser) {
    return this.driversService.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'drivers', action: 'view' })
  @ApiOperation({ summary: 'List/search drivers' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@TransportUser() user: TransportPlatformUser, @Query('search') search?: string) {
    return this.driversService.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'drivers', action: 'view' })
  @ApiOperation({ summary: 'Get a driver' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.driversService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'drivers', action: 'manage' })
  @ApiOperation({ summary: 'Update a driver' })
  @ApiParam({ name: 'id', example: 1 })
  update(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/documents')
  @RequirePermission({ resource: 'drivers', action: 'manage' })
  @ApiOperation({ summary: 'Add a compliance document for a driver' })
  @ApiParam({ name: 'id', example: 1 })
  addDocument(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateDriverDocumentDto) {
    return this.driversService.addDocument(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Get(':id/documents')
  @RequirePermission({ resource: 'drivers', action: 'view' })
  @ApiOperation({ summary: 'Get all documents for a driver' })
  @ApiParam({ name: 'id', example: 1 })
  getDocuments(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.driversService.getDocuments(user.institute_id, id);
  }

  @Post(':id/vehicles/:vehicleId')
  @RequirePermission({ resource: 'drivers', action: 'manage' })
  @ApiOperation({ summary: 'Assign a vehicle to a driver (recorded in vehicle history)' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiParam({ name: 'vehicleId', example: 1 })
  assignVehicle(
    @TransportUser() user: TransportPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Body() dto: AssignVehicleToDriverDto,
  ) {
    return this.driversService.assignVehicle(user.institute_id, id, vehicleId, dto, user.eddva_user_id);
  }

  @Get(':id/vehicles')
  @RequirePermission({ resource: 'drivers', action: 'view' })
  @ApiOperation({ summary: 'Get vehicle assignment history for a driver' })
  @ApiParam({ name: 'id', example: 1 })
  getVehicleHistory(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.driversService.getVehicleHistory(user.institute_id, id);
  }
}
