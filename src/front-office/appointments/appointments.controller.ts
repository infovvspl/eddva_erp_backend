import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { FrontOfficeAccessService } from '../common/front-office-access.service';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { CancelAppointmentDto, CompleteAppointmentDto } from './dto/cancel-appointment.dto';

@ApiTags('Front Office / Appointments')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly access: FrontOfficeAccessService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'appointments', action: 'create' })
  @ApiOperation({ summary: 'Create an appointment (server-side conflict check, concurrency-safe)' })
  create(@Body() dto: CreateAppointmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter appointments' })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'host_employee_id', required: false })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'visitor_id', required: false })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @FrontOfficeUser() user: FrontOfficePlatformUser,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('host_employee_id') hostEmployeeId?: string,
    @Query('department_id') departmentId?: string,
    @Query('status') status?: string,
    @Query('visitor_id') visitorId?: string,
    @Query('phone') phone?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = await this.access.resolveScope(user);
    return this.appointmentsService.findAll(
      {
        date_from: dateFrom,
        date_to: dateTo,
        host_employee_id: hostEmployeeId ? Number(hostEmployeeId) : undefined,
        department_id: departmentId ? Number(departmentId) : undefined,
        status,
        visitor_id: visitorId ? Number(visitorId) : undefined,
        phone,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
      this.access.hostScopedWhere(scope),
    );
  }

  @Get('today')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: "Today's appointments" })
  async today(@FrontOfficeUser() user: FrontOfficePlatformUser) {
    const scope = await this.access.resolveScope(user);
    return this.appointmentsService.today(this.access.hostScopedWhere(scope));
  }

  @Get('upcoming')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: 'Upcoming appointments (default next 7 days)' })
  @ApiQuery({ name: 'days', required: false })
  async upcoming(@FrontOfficeUser() user: FrontOfficePlatformUser, @Query('days') days?: string) {
    const scope = await this.access.resolveScope(user);
    return this.appointmentsService.upcoming(days ? Number(days) : undefined, this.access.hostScopedWhere(scope));
  }

  @Get('availability')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: 'Open time windows for a host on a given date' })
  @ApiQuery({ name: 'host_employee_id', example: 1 })
  @ApiQuery({ name: 'date', example: '2026-09-01' })
  getAvailableSlots(@Query('host_employee_id') hostEmployeeId: string, @Query('date') date: string) {
    return this.appointmentsService.getAvailableSlots(Number(hostEmployeeId), date);
  }

  @Get('conflicts')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: 'Dry-run conflict check for a candidate slot, without booking it' })
  @ApiQuery({ name: 'host_employee_id', example: 1 })
  @ApiQuery({ name: 'date', example: '2026-09-01' })
  @ApiQuery({ name: 'start_time', example: '10:00' })
  @ApiQuery({ name: 'end_time', example: '10:30' })
  @ApiQuery({ name: 'exclude_appointment_id', required: false })
  checkConflicts(
    @Query('host_employee_id') hostEmployeeId: string,
    @Query('date') date: string,
    @Query('start_time') startTime: string,
    @Query('end_time') endTime: string,
    @Query('exclude_appointment_id') excludeAppointmentId?: string,
  ) {
    return this.appointmentsService.checkConflicts({
      host_employee_id: Number(hostEmployeeId),
      date,
      start_time: startTime,
      end_time: endTime,
      exclude_appointment_id: excludeAppointmentId ? Number(excludeAppointmentId) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: 'Get appointment details' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'appointments', action: 'update' })
  @ApiOperation({ summary: 'Update appointment details (visitor/purpose — not date/time/host, use reschedule for that)' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAppointmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.update(id, dto, user.eddva_user_id);
  }

  @Post(':id/confirm')
  @RequirePermission({ resource: 'appointments', action: 'update' })
  @ApiOperation({ summary: 'Confirm a scheduled appointment' })
  @ApiParam({ name: 'id', example: 1 })
  confirm(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.confirm(id, user.eddva_user_id);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'appointments', action: 'update' })
  @ApiOperation({ summary: 'Cancel an appointment' })
  @ApiParam({ name: 'id', example: 1 })
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelAppointmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.cancel(id, dto, user.eddva_user_id);
  }

  @Post(':id/complete')
  @RequirePermission({ resource: 'appointments', action: 'update' })
  @ApiOperation({ summary: 'Mark a confirmed appointment completed' })
  @ApiParam({ name: 'id', example: 1 })
  complete(@Param('id', ParseIntPipe) id: number, @Body() dto: CompleteAppointmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.complete(id, dto, user.eddva_user_id);
  }

  @Post(':id/no-show')
  @RequirePermission({ resource: 'appointments', action: 'update' })
  @ApiOperation({ summary: 'Mark an appointment as a no-show' })
  @ApiParam({ name: 'id', example: 1 })
  noShow(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.noShow(id, user.eddva_user_id);
  }

  @Post(':id/reschedule')
  @RequirePermission({ resource: 'appointments', action: 'update' })
  @ApiOperation({ summary: 'Reschedule an appointment — re-validates the new slot (concurrency-safe)' })
  @ApiParam({ name: 'id', example: 1 })
  reschedule(@Param('id', ParseIntPipe) id: number, @Body() dto: RescheduleAppointmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.appointmentsService.reschedule(id, dto, user.eddva_user_id);
  }
}
