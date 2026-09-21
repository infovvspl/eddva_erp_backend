import { Module } from '@nestjs/common';
import { HostelDynamicRolesController } from './hostel-dynamic-roles.controller';
import { HostelDynamicRolesService } from './hostel-dynamic-roles.service';
import { HostelPermissionsRegistryController } from './hostel-permissions-registry.controller';
import { HostelPermissionsRegistryService } from './hostel-permissions-registry.service';
import { HostelAuthModule } from '../auth/hostel-auth.module';

@Module({
  imports: [HostelAuthModule],
  controllers: [
    HostelDynamicRolesController,
    HostelPermissionsRegistryController,
  ],
  providers: [HostelDynamicRolesService, HostelPermissionsRegistryService],
  exports: [HostelDynamicRolesService, HostelPermissionsRegistryService],
})
export class HostelRolesPermissionsModule {}
