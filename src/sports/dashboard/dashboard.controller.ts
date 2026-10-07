import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from '../auth/sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from '../auth/sports-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Sports / Dashboard')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('api/sports/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'Sports dashboard summary (participants, tournaments, house standings, fixtures, records)' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getSummary(from, to);
  }
}
