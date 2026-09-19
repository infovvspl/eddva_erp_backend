import { Module } from '@nestjs/common';
import { CanteenDynamicRolesController } from './canteen-dynamic-roles.controller';
import { CanteenDynamicRolesService } from './canteen-dynamic-roles.service';
import { CanteenPermissionsRegistryController } from './canteen-permissions-registry.controller';
import { CanteenPermissionsRegistryService } from './canteen-permissions-registry.service';
import { CanteenAuthModule } from '../auth/canteen-auth.module';

@Module({
  imports: [CanteenAuthModule],
  controllers: [
    CanteenDynamicRolesController,
    CanteenPermissionsRegistryController,
  ],
  providers: [
    CanteenDynamicRolesService,
    CanteenPermissionsRegistryService,
  ],
  exports: [CanteenDynamicRolesService, CanteenPermissionsRegistryService],
})
export class CanteenRolesPermissionsModule {}
