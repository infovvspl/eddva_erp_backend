import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { TrackingService } from './tracking.service';
import { RegisterGpsDeviceDto } from './dto/register-gps-device.dto';
import { TriggerAlertDto } from './dto/trigger-alert.dto';
import { CreateVehicleMaintenanceDto } from './dto/create-maintenance.dto';

@ApiTags('Transport / Tracking')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('vehicles/:vehicleId/gps-devices')
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Register a GPS device on a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  registerDevice(@TransportUser() user: TransportPlatformUser, @Param('vehicleId', ParseIntPipe) vehicleId: number, @Body() dto: RegisterGpsDeviceDto) {
    return this.trackingService.registerDevice(user.institute_id, vehicleId, dto, user.eddva_user_id);
  }

  @Get('vehicles/:vehicleId/gps-devices')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'List GPS devices registered on a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  getDevices(@TransportUser() user: TransportPlatformUser, @Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.trackingService.getDevices(user.institute_id, vehicleId);
  }

  @Get('vehicles/:vehicleId/location/current')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'Get current (latest) location of a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  getCurrentLocation(@TransportUser() user: TransportPlatformUser, @Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.trackingService.getLatestLocation(user.institute_id, vehicleId);
  }

  @Get('vehicles/:vehicleId/location/history')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'Get location history of a vehicle within a timeframe' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  @ApiQuery({ name: 'from', required: true, description: 'Start date (ISO)' })
  @ApiQuery({ name: 'to', required: true, description: 'End date (ISO)' })
  getLocationHistory(
    @TransportUser() user: TransportPlatformUser,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.trackingService.getLocationHistory(user.institute_id, vehicleId, new Date(from), new Date(to));
  }

  @Post('vehicles/:vehicleId/alerts')
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Manually trigger a geofence alert for a vehicle (route deviation, speed violation, stop delay, SOS)' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  triggerAlert(@TransportUser() user: TransportPlatformUser, @Param('vehicleId', ParseIntPipe) vehicleId: number, @Body() dto: TriggerAlertDto) {
    return this.trackingService.triggerAlert(user.institute_id, vehicleId, dto, user.eddva_user_id);
  }

  @Patch('alerts/:alertId/resolve')
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Mark a geofence alert resolved' })
  @ApiParam({ name: 'alertId', example: 1 })
  resolveAlert(@TransportUser() user: TransportPlatformUser, @Param('alertId', ParseIntPipe) alertId: number) {
    return this.trackingService.resolveAlert(user.institute_id, alertId, user.eddva_user_id);
  }

  @Get('alerts')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'Get active (unresolved) geofence alerts' })
  @ApiQuery({ name: 'vehicleId', required: false })
  getAlerts(@TransportUser() user: TransportPlatformUser, @Query('vehicleId') vehicleId?: string) {
    return this.trackingService.getActiveAlerts(user.institute_id, vehicleId ? Number(vehicleId) : undefined);
  }

  @Post('vehicles/:vehicleId/maintenance')
  @RequirePermission({ resource: 'vehicles', action: 'manage' })
  @ApiOperation({ summary: 'Add a maintenance record for a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  addMaintenance(@TransportUser() user: TransportPlatformUser, @Param('vehicleId', ParseIntPipe) vehicleId: number, @Body() dto: CreateVehicleMaintenanceDto) {
    return this.trackingService.addMaintenanceRecord(user.institute_id, vehicleId, dto, user.eddva_user_id);
  }

  @Get('vehicles/:vehicleId/maintenance')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({ summary: 'Get maintenance history for a vehicle' })
  @ApiParam({ name: 'vehicleId', example: 1 })
  getMaintenance(@TransportUser() user: TransportPlatformUser, @Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.trackingService.getMaintenanceHistory(user.institute_id, vehicleId);
  }
}
