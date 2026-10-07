import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Library / Dashboard')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Library dashboard summary (catalog, members, issues, reservations, fines)' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getSummary(from, to);
  }
}
