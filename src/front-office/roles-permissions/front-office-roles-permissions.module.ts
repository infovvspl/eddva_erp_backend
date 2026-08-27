import { Module } from '@nestjs/common';
import { FrontOfficeDynamicRolesController } from './front-office-dynamic-roles.controller';
import { FrontOfficeDynamicRolesService } from './front-office-dynamic-roles.service';
import { FrontOfficePermissionsRegistryController } from './front-office-permissions-registry.controller';
import { FrontOfficePermissionsRegistryService } from './front-office-permissions-registry.service';
import { FrontOfficeAuthModule } from '../auth/front-office-auth.module';

@Module({
  imports: [FrontOfficeAuthModule],
  controllers: [FrontOfficeDynamicRolesController, FrontOfficePermissionsRegistryController],
  providers: [FrontOfficeDynamicRolesService, FrontOfficePermissionsRegistryService],
  exports: [FrontOfficeDynamicRolesService, FrontOfficePermissionsRegistryService],
})
export class FrontOfficeRolesPermissionsModule {}
