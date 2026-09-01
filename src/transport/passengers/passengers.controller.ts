import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { PassengersService } from './passengers.service';
import { CreatePassengerDto } from './dto/create-passenger.dto';
import { UpdatePassengerDto } from './dto/update-passenger.dto';
import { AllocatePassengerRouteDto } from './dto/allocate-route.dto';

@ApiTags('Transport / Passengers')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/passengers')
export class PassengersController {
  constructor(private readonly passengersService: PassengersService) {}

  @Post()
  @RequirePermission({ resource: 'passengers', action: 'manage' })
  @ApiOperation({ summary: 'Register a passenger' })
  create(@Body() dto: CreatePassengerDto, @TransportUser() user: TransportPlatformUser) {
    return this.passengersService.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'passengers', action: 'view' })
  @ApiOperation({ summary: 'List/search/filter passengers' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['student', 'employee'] })
  findAll(@TransportUser() user: TransportPlatformUser, @Query('search') search?: string, @Query('type') type?: string) {
    return this.passengersService.findAll(user.institute_id, search, type);
  }

  @Get(':id')
  @RequirePermission({ resource: 'passengers', action: 'view' })
  @ApiOperation({ summary: 'Get a passenger' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.passengersService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'passengers', action: 'manage' })
  @ApiOperation({ summary: 'Update a passenger' })
  @ApiParam({ name: 'id', example: 1 })
  update(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePassengerDto) {
    return this.passengersService.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':passengerId/allocate-route/:routeId')
  @RequirePermission({ resource: 'allocations', action: 'manage' })
  @ApiOperation({ summary: 'Allocate a passenger to a route (optionally with pickup/drop stops)' })
  @ApiParam({ name: 'passengerId', example: 1 })
  @ApiParam({ name: 'routeId', example: 1 })
  allocateRoute(
    @TransportUser() user: TransportPlatformUser,
    @Param('passengerId', ParseIntPipe) passengerId: number,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Body() dto: AllocatePassengerRouteDto,
  ) {
    return this.passengersService.allocateRoute(user.institute_id, passengerId, routeId, dto, user.eddva_user_id);
  }

  @Get(':id/allocations')
  @RequirePermission({ resource: 'allocations', action: 'view' })
  @ApiOperation({ summary: 'Get route allocation history for a passenger' })
  @ApiParam({ name: 'id', example: 1 })
  getAllocations(@TransportUser() user: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.passengersService.getAllocations(user.institute_id, id);
  }
}
