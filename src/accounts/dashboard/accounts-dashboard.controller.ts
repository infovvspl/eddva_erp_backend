import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccountsDashboardService } from './accounts-dashboard.service';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';

@ApiTags('Accounts / Dashboard')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/dashboard')
export class AccountsDashboardController {
  constructor(private readonly dashboardService: AccountsDashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({ summary: 'Accounts dashboard: open financial year, draft/posted/cancelled voucher counts, cash & bank balances, recent vouchers' })
  getSummary(@AccountsUser() user: AccountsPlatformUser) {
    return this.dashboardService.getSummary(user.institute_id);
  }
}
