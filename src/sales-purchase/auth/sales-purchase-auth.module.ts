import { Module } from '@nestjs/common';
import { SalesPurchaseAuthController } from './sales-purchase-auth.controller';
import { SalesPurchaseAuthService } from './sales-purchase-auth.service';
import { SalesPurchaseJwtGuard } from './sales-purchase-jwt.guard';
import { SalesPurchaseInstituteAdminViewOnlyGuard } from './sales-purchase-institute-admin-view-only.guard';
import { SalesPurchasePermissionsGuard } from './sales-purchase-permissions.guard';
import { SalesPurchaseAccessService } from '../common/sales-purchase-access.service';

@Module({
  controllers: [SalesPurchaseAuthController],
  providers: [
    SalesPurchaseAuthService,
    SalesPurchaseJwtGuard,
    SalesPurchaseInstituteAdminViewOnlyGuard,
    SalesPurchasePermissionsGuard,
    SalesPurchaseAccessService,
  ],
  exports: [
    SalesPurchaseAuthService,
    SalesPurchaseJwtGuard,
    SalesPurchaseInstituteAdminViewOnlyGuard,
    SalesPurchasePermissionsGuard,
    SalesPurchaseAccessService,
  ],
})
export class SalesPurchaseAuthModule {}
