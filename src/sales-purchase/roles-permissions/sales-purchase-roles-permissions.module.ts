import { Module } from '@nestjs/common';
import { SalesPurchaseDynamicRolesController } from './sales-purchase-dynamic-roles.controller';
import { SalesPurchaseDynamicRolesService } from './sales-purchase-dynamic-roles.service';
import { SalesPurchasePermissionsRegistryController } from './sales-purchase-permissions-registry.controller';
import { SalesPurchasePermissionsRegistryService } from './sales-purchase-permissions-registry.service';
import { SalesPurchaseAuthModule } from '../auth/sales-purchase-auth.module';

@Module({
  imports: [SalesPurchaseAuthModule],
  controllers: [
    SalesPurchaseDynamicRolesController,
    SalesPurchasePermissionsRegistryController,
  ],
  providers: [
    SalesPurchaseDynamicRolesService,
    SalesPurchasePermissionsRegistryService,
  ],
  exports: [
    SalesPurchaseDynamicRolesService,
    SalesPurchasePermissionsRegistryService,
  ],
})
export class SalesPurchaseRolesPermissionsModule {}
