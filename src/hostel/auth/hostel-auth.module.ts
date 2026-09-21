import { Module } from '@nestjs/common';
import { HostelAuthController } from './hostel-auth.controller';
import { HostelAuthService } from './hostel-auth.service';
import { HostelJwtGuard } from './hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from './hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from './hostel-permissions.guard';
import { HostelAccessService } from '../common/hostel-access.service';

@Module({
  controllers: [HostelAuthController],
  providers: [
    HostelAuthService,
    HostelJwtGuard,
    HostelInstituteAdminViewOnlyGuard,
    HostelPermissionsGuard,
    HostelAccessService,
  ],
  exports: [
    HostelAuthService,
    HostelJwtGuard,
    HostelInstituteAdminViewOnlyGuard,
    HostelPermissionsGuard,
    HostelAccessService,
  ],
})
export class HostelAuthModule {}
