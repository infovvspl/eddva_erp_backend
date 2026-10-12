import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Dashboard')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller('api/staff/dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get()
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Headcount and status summary, by type and department' })
  getSummary(@StaffUser() actor: StaffPlatformUser) {
    return this.svc.getSummary(actor.institute_id);
  }
}
