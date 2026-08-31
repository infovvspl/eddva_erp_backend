import { Module } from '@nestjs/common';
import { InventoryAuthController } from './inventory-auth.controller';
import { InventoryAuthService } from './inventory-auth.service';
import { InventoryJwtGuard } from './inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from './inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from './inventory-permissions.guard';
import { InventoryAccessService } from '../common/inventory-access.service';

@Module({
  controllers: [InventoryAuthController],
  providers: [
    InventoryAuthService,
    InventoryJwtGuard,
    InventoryInstituteAdminViewOnlyGuard,
    InventoryPermissionsGuard,
    InventoryAccessService,
  ],
  exports: [
    InventoryAuthService,
    InventoryJwtGuard,
    InventoryInstituteAdminViewOnlyGuard,
    InventoryPermissionsGuard,
    InventoryAccessService,
  ],
})
export class InventoryAuthModule {}
