import { Module } from '@nestjs/common';
import { AccountsAuthController } from './accounts-auth.controller';
import { AccountsAuthService } from './accounts-auth.service';
import { AccountsJwtGuard } from './accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from './accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from './accounts-permissions.guard';
import { AccountsAccessService } from '../common/accounts-access.service';

@Module({
  controllers: [AccountsAuthController],
  providers: [
    AccountsAuthService,
    AccountsJwtGuard,
    AccountsInstituteAdminViewOnlyGuard,
    AccountsPermissionsGuard,
    AccountsAccessService,
  ],
  exports: [
    AccountsAuthService,
    AccountsJwtGuard,
    AccountsInstituteAdminViewOnlyGuard,
    AccountsPermissionsGuard,
    AccountsAccessService,
  ],
})
export class AccountsAuthModule {}
