import { Module } from '@nestjs/common';
import { AdmissionAuthController } from './admission-auth.controller';
import { AdmissionAuthService } from './admission-auth.service';
import { AdmissionJwtGuard } from './admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from './admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from './admission-permissions.guard';
import { AdmissionAccessService } from '../common/admission-access.service';

@Module({
  controllers: [AdmissionAuthController],
  providers: [
    AdmissionAuthService,
    AdmissionJwtGuard,
    AdmissionInstituteAdminViewOnlyGuard,
    AdmissionPermissionsGuard,
    AdmissionAccessService,
  ],
  exports: [
    AdmissionAuthService,
    AdmissionJwtGuard,
    AdmissionInstituteAdminViewOnlyGuard,
    AdmissionPermissionsGuard,
    AdmissionAccessService,
  ],
})
export class AdmissionAuthModule {}
