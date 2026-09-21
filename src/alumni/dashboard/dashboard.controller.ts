import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { DashboardService } from './dashboard.service';

@ApiTags('Alumni / Dashboard')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@StaffOnly()
@Controller('api/alumni/dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary: 'One-page alumni office summary across all modules',
  })
  summary(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.summary(user.institute_id);
  }

  @Get('directory')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Directory statistics: totals, verification funnel, by batch / program / industry / location',
  })
  directory(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.directory(user.institute_id);
  }

  @Get('events')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Events: upcoming, registrations, attendance, capacity, paid revenue',
  })
  events(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.events(user.institute_id);
  }

  @Get('jobs')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Job board: open, expiring, applications, hires' })
  jobs(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.jobs(user.institute_id);
  }

  @Get('mentorship')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Mentorship: programs, mentors, matches' })
  mentorship(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.mentorship(user.institute_id);
  }

  @Get('donations')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Fundraising: campaigns and progress, totals (from the donation ledger), donors, trends. Anonymous donors are never named',
  })
  donations(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.donations(user.institute_id);
  }

  @Get('communication')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Communication: newsletters sent, delivery, opens, clicks, failures',
  })
  communication(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.communication(user.institute_id);
  }
}
