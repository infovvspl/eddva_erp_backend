import { Module } from '@nestjs/common';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffJwtGuard } from './staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from './staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from './staff-permissions.guard';
import { StaffAccessService } from '../common/staff-access.service';

@Module({
  controllers: [StaffAuthController],
  providers: [
    StaffAuthService,
    StaffJwtGuard,
    StaffInstituteAdminViewOnlyGuard,
    StaffPermissionsGuard,
    StaffAccessService,
  ],
  exports: [
    StaffAuthService,
    StaffJwtGuard,
    StaffInstituteAdminViewOnlyGuard,
    StaffPermissionsGuard,
    StaffAccessService,
  ],
})
export class StaffAuthModule {}
