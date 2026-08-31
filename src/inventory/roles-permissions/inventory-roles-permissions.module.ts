import { Module } from '@nestjs/common';
import { InventoryDynamicRolesController } from './inventory-dynamic-roles.controller';
import { InventoryDynamicRolesService } from './inventory-dynamic-roles.service';
import { InventoryPermissionsRegistryController } from './inventory-permissions-registry.controller';
import { InventoryPermissionsRegistryService } from './inventory-permissions-registry.service';
import { InventoryAuthModule } from '../auth/inventory-auth.module';

@Module({
  imports: [InventoryAuthModule],
  controllers: [InventoryDynamicRolesController, InventoryPermissionsRegistryController],
  providers: [InventoryDynamicRolesService, InventoryPermissionsRegistryService],
  exports: [InventoryDynamicRolesService, InventoryPermissionsRegistryService],
})
export class InventoryRolesPermissionsModule {}
