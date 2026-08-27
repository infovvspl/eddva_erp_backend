import { Module } from '@nestjs/common';
import { FrontOfficeAuthController } from './front-office-auth.controller';
import { FrontOfficeAuthService } from './front-office-auth.service';
import { FrontOfficeJwtGuard } from './front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from './front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from './front-office-permissions.guard';
import { FrontOfficeAccessService } from '../common/front-office-access.service';

@Module({
  controllers: [FrontOfficeAuthController],
  providers: [
    FrontOfficeAuthService,
    FrontOfficeJwtGuard,
    FrontOfficeInstituteAdminViewOnlyGuard,
    FrontOfficePermissionsGuard,
    FrontOfficeAccessService,
  ],
  exports: [
    FrontOfficeAuthService,
    FrontOfficeJwtGuard,
    FrontOfficeInstituteAdminViewOnlyGuard,
    FrontOfficePermissionsGuard,
    FrontOfficeAccessService,
  ],
})
export class FrontOfficeAuthModule {}
