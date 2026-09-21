import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import {
  RequirePermission,
  RequirePermissions,
} from '../auth/require-permissions.decorator';
import { HostelAccessService } from '../common/hostel-access.service';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { DashboardService } from './dashboard.service';

class DashboardQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'Day for the attendance and mess sections (default today)',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

@ApiTags('Hostel / Dashboard')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/dashboard')
export class DashboardController {
  constructor(
    private readonly svc: DashboardService,
    private readonly access: HostelAccessService,
  ) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Everything on one screen: occupancy, gate, attendance, complaints, mess — and fees when the caller holds invoices:read',
  })
  async summary(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: DashboardQueryDto,
  ) {
    // Fee totals are finance data: only shown to callers who may read invoices.
    const includeFees = await this.access.hasPermission(
      user,
      'invoices',
      'read',
    );
    return this.svc.summary(user.institute_id, query.date, includeFees);
  }

  @Get('occupancy')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Blocks, rooms (available/full/maintenance), beds, occupied/vacant places, occupancy %, resident status counts',
  })
  occupancy(@HostelUser() user: HostelPlatformUser) {
    return this.svc.occupancy(user.institute_id);
  }

  @Get('gate-status')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Currently out, expected returns today, overdue, todays outings and returns, pending approvals',
  })
  gate(@HostelUser() user: HostelPlatformUser) {
    return this.svc.gateStatus(user.institute_id);
  }

  @Get('attendance')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Present / absent / on leave / unaccounted absences for a day, by session',
  })
  attendance(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.svc.attendanceStats(user.institute_id, query.date);
  }

  @Get('complaints')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary: 'Open, in progress, urgent, unassigned, resolved complaints',
  })
  complaints(@HostelUser() user: HostelPlatformUser) {
    return this.svc.complaints(user.institute_id);
  }

  @Get('fees')
  @RequirePermissions(
    { resource: 'dashboard', action: 'read' },
    { resource: 'invoices', action: 'read' },
  )
  @ApiOperation({ summary: 'Total due, paid, outstanding, overdue invoices' })
  fees(@HostelUser() user: HostelPlatformUser) {
    return this.svc.fees(user.institute_id);
  }

  @Get('mess')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary: "Today's expected meals, opted in/out, consumed, missed",
  })
  mess(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.svc.messStats(user.institute_id, query.date);
  }
}
