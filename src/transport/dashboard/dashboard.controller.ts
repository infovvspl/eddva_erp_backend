import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { DashboardService } from './dashboard.service';

@ApiTags('Transport / Dashboard')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'vehicles', action: 'view' })
  @ApiOperation({
    summary:
      'Transport dashboard: fleet/route/driver/passenger counts, open geofence alerts, maintenance due and this month\'s fee collection',
  })
  summary(@TransportUser() user: TransportPlatformUser) {
    return this.svc.getSummary(user.institute_id);
  }
}
