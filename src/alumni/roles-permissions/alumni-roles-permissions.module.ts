import { Module } from '@nestjs/common';
import { AlumniDynamicRolesController } from './alumni-dynamic-roles.controller';
import { AlumniDynamicRolesService } from './alumni-dynamic-roles.service';
import { AlumniPermissionsRegistryController } from './alumni-permissions-registry.controller';
import { AlumniPermissionsRegistryService } from './alumni-permissions-registry.service';
import { AlumniAuthModule } from '../auth/alumni-auth.module';

@Module({
  imports: [AlumniAuthModule],
  controllers: [
    AlumniDynamicRolesController,
    AlumniPermissionsRegistryController,
  ],
  providers: [AlumniDynamicRolesService, AlumniPermissionsRegistryService],
  exports: [AlumniDynamicRolesService, AlumniPermissionsRegistryService],
})
export class AlumniRolesPermissionsModule {}
