import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SportsDashboardService } from './sports-dashboard.service';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from '../auth/sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from '../auth/sports-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SportsUser } from '../auth/sports-user.decorator';
import type { SportsPlatformUser } from '../auth/sports-auth.service';

@ApiTags('Sports / Dashboard')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('api/sports/dashboard')
export class SportsDashboardController {
  constructor(private readonly dashboardService: SportsDashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'sports', action: 'read' })
  @ApiOperation({ summary: 'Sports dashboard: sports, participants, houses, tournaments, fixtures, standings' })
  @ApiQuery({ name: 'academic_year', required: false, example: '2026-27' })
  getSummary(@SportsUser() user: SportsPlatformUser, @Query('academic_year') academicYear?: string) {
    return this.dashboardService.getSummary(user.institute_id, academicYear);
  }
}
