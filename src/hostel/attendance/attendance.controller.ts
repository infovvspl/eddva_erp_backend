import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { AttendanceService } from './attendance.service';
import {
  BulkAttendanceDto,
  MarkAttendanceDto,
  QueryAttendanceDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';

@ApiTags('Hostel / Attendance')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Post()
  @RequirePermission({ resource: 'attendance', action: 'mark' })
  @ApiOperation({
    summary:
      'Mark one resident for a date + session (morning/night). Duplicate resident/date/session is rejected with 409',
  })
  mark(@HostelUser() user: HostelPlatformUser, @Body() dto: MarkAttendanceDto) {
    return this.svc.mark(user, dto);
  }

  @Post('bulk')
  @RequirePermission({ resource: 'attendance', action: 'mark' })
  @ApiOperation({
    summary:
      'Roll call for many residents in one session — all-or-nothing; reports unknown, inactive or already-marked residents',
  })
  bulk(@HostelUser() user: HostelPlatformUser, @Body() dto: BulkAttendanceDto) {
    return this.svc.bulk(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'attendance', action: 'read' })
  @ApiOperation({
    summary:
      'List attendance by date / range, session, status, resident, block or room',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryAttendanceDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('summary')
  @RequirePermission({ resource: 'attendance', action: 'read' })
  @ApiOperation({
    summary:
      'Present / absent / on-leave tallies per session (and unmarked residents for a single day)',
  })
  summary(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryAttendanceDto,
  ) {
    return this.svc.summary(user.institute_id, query);
  }

  @Get('absences')
  @RequirePermission({ resource: 'attendance', action: 'read' })
  @ApiOperation({
    summary:
      'Absence report: absent residents with the gate pass that explains each one (accounted_for). unaccounted_only=true keeps just the unexplained',
  })
  absences(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryAttendanceDto,
  ) {
    return this.svc.absences(user.institute_id, query);
  }

  @Get('resident/:residentId')
  @RequirePermission({ resource: 'attendance', action: 'read' })
  @ApiOperation({ summary: 'Attendance history of one resident' })
  @ApiParam({ name: 'residentId', example: 1 })
  residentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('residentId', ParseIntPipe) residentId: number,
    @Query() query: QueryAttendanceDto,
  ) {
    return this.svc.residentHistory(user.institute_id, residentId, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'attendance', action: 'read' })
  @ApiOperation({ summary: 'Get one attendance record' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'attendance', action: 'update' })
  @ApiOperation({
    summary: 'Correct an attendance record (audited with old and new status)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.svc.update(user, id, dto);
  }
}
