import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LibDashboardService } from './lib-dashboard.service';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Dashboard')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/dashboard')
export class LibDashboardController {
  constructor(private readonly dashboardService: LibDashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'catalog', action: 'read' })
  @ApiOperation({ summary: 'Library dashboard: stock, loans, overdue, members, reservations, unpaid fines' })
  getSummary(@LibUser() user: LibPlatformUser) {
    return this.dashboardService.getSummary(user.institute_id);
  }
}
