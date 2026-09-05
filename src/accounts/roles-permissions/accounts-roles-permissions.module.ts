import { Module } from '@nestjs/common';
import { AccountsDynamicRolesController } from './accounts-dynamic-roles.controller';
import { AccountsDynamicRolesService } from './accounts-dynamic-roles.service';
import { AccountsPermissionsRegistryController } from './accounts-permissions-registry.controller';
import { AccountsPermissionsRegistryService } from './accounts-permissions-registry.service';
import { AccountsAuthModule } from '../auth/accounts-auth.module';

@Module({
  imports: [AccountsAuthModule],
  controllers: [AccountsDynamicRolesController, AccountsPermissionsRegistryController],
  providers: [AccountsDynamicRolesService, AccountsPermissionsRegistryService],
  exports: [AccountsDynamicRolesService, AccountsPermissionsRegistryService],
})
export class AccountsRolesPermissionsModule {}
