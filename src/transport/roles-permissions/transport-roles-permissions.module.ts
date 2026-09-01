import { Module } from '@nestjs/common';
import { TransportDynamicRolesController } from './transport-dynamic-roles.controller';
import { TransportDynamicRolesService } from './transport-dynamic-roles.service';
import { TransportPermissionsRegistryController } from './transport-permissions-registry.controller';
import { TransportPermissionsRegistryService } from './transport-permissions-registry.service';
import { TransportAuthModule } from '../auth/transport-auth.module';

@Module({
  imports: [TransportAuthModule],
  controllers: [TransportDynamicRolesController, TransportPermissionsRegistryController],
  providers: [TransportDynamicRolesService, TransportPermissionsRegistryService],
  exports: [TransportDynamicRolesService, TransportPermissionsRegistryService],
})
export class TransportRolesPermissionsModule {}
