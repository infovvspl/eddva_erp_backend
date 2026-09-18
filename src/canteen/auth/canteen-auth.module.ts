import { Module } from '@nestjs/common';
import { CanteenAuthController } from './canteen-auth.controller';
import { CanteenAuthService } from './canteen-auth.service';
import { CanteenJwtGuard } from './canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from './canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from './canteen-permissions.guard';
import { CanteenAccessService } from '../common/canteen-access.service';

@Module({
  controllers: [CanteenAuthController],
  providers: [
    CanteenAuthService,
    CanteenJwtGuard,
    CanteenInstituteAdminViewOnlyGuard,
    CanteenPermissionsGuard,
    CanteenAccessService,
  ],
  exports: [
    CanteenAuthService,
    CanteenJwtGuard,
    CanteenInstituteAdminViewOnlyGuard,
    CanteenPermissionsGuard,
    CanteenAccessService,
  ],
})
export class CanteenAuthModule {}
