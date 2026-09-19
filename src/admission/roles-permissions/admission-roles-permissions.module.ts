import { Module } from '@nestjs/common';
import { AdmissionDynamicRolesController } from './admission-dynamic-roles.controller';
import { AdmissionDynamicRolesService } from './admission-dynamic-roles.service';
import { AdmissionPermissionsRegistryController } from './admission-permissions-registry.controller';
import { AdmissionPermissionsRegistryService } from './admission-permissions-registry.service';
import { AdmissionAuthModule } from '../auth/admission-auth.module';

@Module({
  imports: [AdmissionAuthModule],
  controllers: [
    AdmissionDynamicRolesController,
    AdmissionPermissionsRegistryController,
  ],
  providers: [
    AdmissionDynamicRolesService,
    AdmissionPermissionsRegistryService,
  ],
  exports: [AdmissionDynamicRolesService, AdmissionPermissionsRegistryService],
})
export class AdmissionRolesPermissionsModule {}
