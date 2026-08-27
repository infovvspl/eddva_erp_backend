import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateAvailabilitySlotDto } from './dto/create-availability-slot.dto';

@ApiTags('Front Office / Employees')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermission({ resource: 'employees', action: 'create' })
  @ApiOperation({ summary: 'Create a Front Office employee' })
  create(@Body() dto: CreateEmployeeDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.employeesService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'employees', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter Front Office employees' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('search') search?: string,
    @Query('department_id') departmentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.employeesService.findAll({
      search,
      departmentId: departmentId ? Number(departmentId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('available')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: 'Find employees available for a given date/time window' })
  @ApiQuery({ name: 'date', example: '2026-09-01' })
  @ApiQuery({ name: 'start_time', example: '09:00' })
  @ApiQuery({ name: 'end_time', example: '09:30' })
  @ApiQuery({ name: 'department_id', required: false })
  findAvailable(
    @Query('date') date: string,
    @Query('start_time') start_time: string,
    @Query('end_time') end_time: string,
    @Query('department_id') departmentId?: string,
  ) {
    return this.employeesService.findAvailableEmployees({
      date,
      start_time,
      end_time,
      department_id: departmentId ? Number(departmentId) : undefined,
    });
  }

  @Patch('availability/:slotId')
  @RequirePermission({ resource: 'employees', action: 'update' })
  @ApiOperation({ summary: 'Update an employee availability slot' })
  @ApiParam({ name: 'slotId', example: 1 })
  updateAvailabilitySlot(@Param('slotId', ParseIntPipe) slotId: number, @Body() dto: Partial<CreateAvailabilitySlotDto>) {
    return this.employeesService.updateAvailabilitySlot(slotId, dto);
  }

  @Delete('availability/:slotId')
  @RequirePermission({ resource: 'employees', action: 'update' })
  @ApiOperation({ summary: 'Delete an employee availability slot' })
  @ApiParam({ name: 'slotId', example: 1 })
  deleteAvailabilitySlot(@Param('slotId', ParseIntPipe) slotId: number) {
    return this.employeesService.deleteAvailabilitySlot(slotId);
  }

  @Get(':id')
  @RequirePermission({ resource: 'employees', action: 'read' })
  @ApiOperation({ summary: 'Get a Front Office employee' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'employees', action: 'update' })
  @ApiOperation({ summary: 'Update a Front Office employee' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.employeesService.update(id, dto, user.eddva_user_id);
  }

  @Get(':id/appointments')
  @RequirePermission({ resource: 'appointments', action: 'read' })
  @ApiOperation({ summary: "Get an employee's appointments" })
  @ApiParam({ name: 'id', example: 1 })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'status', required: false })
  getAppointments(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.employeesService.getAppointments(id, { from, to, status });
  }

  @Get(':id/availability')
  @RequirePermission({ resource: 'employees', action: 'read' })
  @ApiOperation({ summary: "Get an employee's availability slots" })
  @ApiParam({ name: 'id', example: 1 })
  @ApiQuery({ name: 'date', required: false })
  getAvailability(@Param('id', ParseIntPipe) id: number, @Query('date') date?: string) {
    return this.employeesService.getAvailability(id, date);
  }

  @Post(':id/availability')
  @RequirePermission({ resource: 'employees', action: 'update' })
  @ApiOperation({ summary: 'Add an availability slot for an employee' })
  @ApiParam({ name: 'id', example: 1 })
  createAvailability(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateAvailabilitySlotDto) {
    return this.employeesService.createAvailabilitySlot(id, dto);
  }
}
