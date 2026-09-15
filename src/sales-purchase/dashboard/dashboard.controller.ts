import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchaseInstituteAdminViewOnlyGuard } from '../auth/sales-purchase-institute-admin-view-only.guard';
import { SalesPurchasePermissionsGuard } from '../auth/sales-purchase-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { DashboardService } from './dashboard.service';

@ApiTags('Sales & Purchase / Dashboard')
@ApiBearerAuth()
@UseGuards(SalesPurchaseJwtGuard, SalesPurchaseInstituteAdminViewOnlyGuard, SalesPurchasePermissionsGuard)
@Controller('api/sales-purchase/dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Sales & Purchase dashboard summary — vendor/customer/item counts, PO/GRN/SO status breakdowns, outstanding & overdue invoice balances, period totals, and top vendors/customers by posted invoice value',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-04-01', description: 'Filters period_* totals and top vendors/customers by invoice_date; outstanding/overdue balances are always as-of-now' })
  @ApiQuery({ name: 'to', required: false, example: '2026-09-30' })
  getSummary(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getSummary(user.institute_id, from, to);
  }
}
