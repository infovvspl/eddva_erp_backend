import { Module } from '@nestjs/common';
import { StaffDynamicRolesController } from './staff-dynamic-roles.controller';
import { StaffDynamicRolesService } from './staff-dynamic-roles.service';
import { StaffPermissionsRegistryController } from './staff-permissions-registry.controller';
import { StaffPermissionsRegistryService } from './staff-permissions-registry.service';
import { StaffAuthModule } from '../auth/staff-auth.module';

@Module({
  imports: [StaffAuthModule],
  controllers: [
    StaffDynamicRolesController,
    StaffPermissionsRegistryController,
  ],
  providers: [StaffDynamicRolesService, StaffPermissionsRegistryService],
  exports: [StaffDynamicRolesService, StaffPermissionsRegistryService],
})
export class StaffRolesPermissionsModule {}
