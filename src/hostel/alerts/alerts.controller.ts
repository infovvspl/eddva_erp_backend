import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { QueryGatePassDto } from '../gate-passes/dto/gate-pass.dto';
import { UnaccountedAbsenceQueryDto } from '../attendance/dto/attendance.dto';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { AttendanceService } from '../attendance/attendance.service';

/**
 * The two safety alerts. Both are computed live from source data (gate scans
 * and roll call) so they are correct the instant they become true — the
 * scheduled sweeps only persist the state change and queue notifications.
 */
@ApiTags('Hostel / Alerts')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/alerts')
export class AlertsController {
  constructor(
    private readonly gatePasses: GatePassesService,
    private readonly attendance: AttendanceService,
  ) {}

  @Get('overdue-passes')
  @RequirePermission({ resource: 'alerts', action: 'read' })
  @ApiOperation({
    summary:
      'Residents still outside past their expected return time (most overdue first), with minutes overdue',
  })
  overduePasses(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryGatePassDto,
  ) {
    return this.gatePasses.overdue(user.institute_id, query);
  }

  @Get('unaccounted-absences')
  @RequirePermission({ resource: 'alerts', action: 'read' })
  @ApiOperation({
    summary:
      'Residents marked ABSENT at roll call with no gate-verified pass explaining it. ?date=YYYY-MM-DD (default today), optional session and block_id',
  })
  unaccountedAbsences(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: UnaccountedAbsenceQueryDto,
  ) {
    return this.attendance.unaccountedAbsences(user.institute_id, query);
  }

  @Get('summary')
  @RequirePermission({ resource: 'alerts', action: 'read' })
  @ApiOperation({ summary: 'Counts for both alerts (for a header badge)' })
  async summary(@HostelUser() user: HostelPlatformUser) {
    const [overdue, unaccounted] = await Promise.all([
      this.gatePasses.overdue(user.institute_id, { limit: 1 }),
      this.attendance.unaccountedAbsences(user.institute_id, { limit: 1 }),
    ]);
    return {
      overdue_passes: overdue.pagination.total,
      unaccounted_absences_today: unaccounted.pagination.total,
    };
  }
}
