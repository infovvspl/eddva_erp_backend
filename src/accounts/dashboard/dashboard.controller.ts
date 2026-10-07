import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { DashboardService } from './dashboard.service';

@ApiTags('Accounts / Dashboard')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary: 'Accounts dashboard summary (ledger accounts, financial year, vouchers by status/type, cash & bank balances)',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  getSummary(@AccountsUser() user: AccountsPlatformUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getSummary(user, from, to);
  }
}
