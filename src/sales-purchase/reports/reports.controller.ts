import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchasePermissionsGuard } from '../auth/sales-purchase-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { ReportsService } from './reports.service';
import {
  PurchaseRegisterQueryDto,
  SalesRegisterQueryDto,
} from './dto/register-query.dto';

/**
 * Read-only — deliberately no write endpoints exist for either register
 * (module spec §65). Not gated by SalesPurchaseInstituteAdminViewOnlyGuard
 * since every route here is already GET-only.
 */
@ApiTags('Sales & Purchase / Reports')
@ApiBearerAuth()
@UseGuards(SalesPurchaseJwtGuard, SalesPurchasePermissionsGuard)
@Controller('api/sales-purchase/reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('purchase-register')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Purchase Register — line-item view over POSTED purchase invoices, with summary totals',
  })
  purchaseRegister(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: PurchaseRegisterQueryDto,
  ) {
    return this.svc.purchaseRegister(user.institute_id, query);
  }

  @Get('sales-register')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Sales Register — line-item view over POSTED sales invoices, with summary totals',
  })
  salesRegister(
    @SalesPurchaseUser() user: SalesPurchasePlatformUser,
    @Query() query: SalesRegisterQueryDto,
  ) {
    return this.svc.salesRegister(user.institute_id, query);
  }
}
