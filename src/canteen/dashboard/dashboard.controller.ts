import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { DashboardService } from './dashboard.service';

@ApiTags('Canteen / Dashboard')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard, CanteenInstituteAdminViewOnlyGuard, CanteenPermissionsGuard)
@Controller('api/canteen/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Canteen dashboard summary (members, wallets, orders, top items, category sales, payment summary, POS shifts)',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  getSummary(@CanteenUser() user: CanteenPlatformUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getSummary(user.institute_id, from, to);
  }
}
