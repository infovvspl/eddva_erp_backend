import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CanteenDashboardService } from './canteen-dashboard.service';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';

@ApiTags('Canteen / Dashboard')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard, CanteenPermissionsGuard)
@Controller('api/canteen/dashboard')
export class CanteenDashboardController {
  constructor(private readonly dashboardService: CanteenDashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Canteen dashboard: today\'s orders/revenue, unpaid orders, members, open shifts, wallet balances, top items, recent orders' })
  getSummary(@CanteenUser() user: CanteenPlatformUser) {
    return this.dashboardService.getSummary(user.institute_id);
  }
}
