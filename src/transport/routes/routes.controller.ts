import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { CreateRouteStopDto } from './dto/create-route-stop.dto';
import { AssignVehicleToRouteDto } from './dto/assign-vehicle.dto';

@ApiTags('Transport / Routes')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @RequirePermission({ resource: 'routes', action: 'manage' })
  @ApiOperation({ summary: 'Create a route' })
  create(@Body() dto: CreateRouteDto, @TransportUser() user: TransportPlatformUser) {
    return this.routesService.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'routes', action: 'view' })
  @ApiOperation({ summary: 'List/search routes' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@TransportUser() user: TransportPlatformUser, @Query('search') search?: string) {
    return this.routesService.findAll(user.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'routes', action: 'view' })
  @ApiOperation({ summary: 'Get a route with its stops' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.routesService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'routes', action: 'manage' })
  @ApiOperation({ summary: 'Update a route' })
  @ApiParam({ name: 'id', example: 1 })
  update(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRouteDto) {
    return this.routesService.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'routes', action: 'manage' })
  @ApiOperation({ summary: 'Delete a route' })
  @ApiParam({ name: 'id', example: 1 })
  remove(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.routesService.remove(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/stops')
  @RequirePermission({ resource: 'routes', action: 'manage' })
  @ApiOperation({ summary: 'Add a stop to a route' })
  @ApiParam({ name: 'id', example: 1 })
  addStop(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateRouteStopDto) {
    return this.routesService.addStop(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Get(':id/stops')
  @RequirePermission({ resource: 'routes', action: 'view' })
  @ApiOperation({ summary: 'Get all stops for a route, in sequence order' })
  @ApiParam({ name: 'id', example: 1 })
  getStops(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.routesService.getStops(user.institute_id, id);
  }

  @Post(':routeId/assign-vehicle/:vehicleId')
  @RequirePermission({ resource: 'routes', action: 'manage' })
  @ApiOperation({ summary: 'Assign a vehicle (and optionally a driver) to a route' })
  @ApiParam({ name: 'routeId', example: 1 })
  @ApiParam({ name: 'vehicleId', example: 1 })
  assignVehicle(
    @TransportUser() user: TransportPlatformUser,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Body() dto: AssignVehicleToRouteDto,
  ) {
    return this.routesService.assignVehicle(user.institute_id, routeId, vehicleId, dto, user.eddva_user_id);
  }

  @Get(':id/assignments')
  @RequirePermission({ resource: 'routes', action: 'view' })
  @ApiOperation({ summary: 'List vehicle/driver assignments for a route' })
  @ApiParam({ name: 'id', example: 1 })
  getAssignments(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.routesService.getVehicleAssignments(user.institute_id, id);
  }
}
