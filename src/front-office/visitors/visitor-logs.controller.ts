import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { FrontOfficeAccessService } from '../common/front-office-access.service';
import { VisitorLogsService } from './visitor-logs.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@ApiTags('Front Office / Visitor Logs')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/visitor-logs')
export class VisitorLogsController {
  constructor(
    private readonly visitorLogsService: VisitorLogsService,
    private readonly access: FrontOfficeAccessService,
  ) {}

  @Post('check-in')
  @RequirePermission({ resource: 'visitors', action: 'checkin' })
  @ApiOperation({ summary: 'Check in a visitor (walk-in or against a scheduled appointment)' })
  checkIn(@Body() dto: CheckInDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.visitorLogsService.checkIn(dto, user.eddva_user_id);
  }

  @Get('active')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'List everyone currently checked in' })
  findActive() {
    return this.visitorLogsService.findActive();
  }

  @Get()
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'List/filter visitor logs' })
  @ApiQuery({ name: 'date', required: false, example: '2026-09-01' })
  @ApiQuery({ name: 'host_employee_id', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'appointment_id', required: false })
  @ApiQuery({ name: 'visitor_id', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @FrontOfficeUser() user: FrontOfficePlatformUser,
    @Query('date') date?: string,
    @Query('host_employee_id') hostEmployeeId?: string,
    @Query('status') status?: string,
    @Query('appointment_id') appointmentId?: string,
    @Query('visitor_id') visitorId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = await this.access.resolveScope(user);
    return this.visitorLogsService.findAll(
      {
        date,
        host_employee_id: hostEmployeeId ? Number(hostEmployeeId) : undefined,
        status,
        appointment_id: appointmentId ? Number(appointmentId) : undefined,
        visitor_id: visitorId ? Number(visitorId) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
      this.access.hostRelationScopedWhere(scope),
    );
  }

  @Get(':id')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Get a visitor log' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.visitorLogsService.findOne(id);
  }

  @Patch(':id/check-out')
  @RequirePermission({ resource: 'visitors', action: 'checkin' })
  @ApiOperation({ summary: 'Check out a visitor' })
  @ApiParam({ name: 'id', example: 1 })
  checkOut(@Param('id', ParseIntPipe) id: number, @Body() dto: CheckOutDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.visitorLogsService.checkOut(id, dto, user.eddva_user_id);
  }
}
