import { Module } from '@nestjs/common';
import { TransportAuthController } from './transport-auth.controller';
import { TransportAuthService } from './transport-auth.service';
import { TransportJwtGuard } from './transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from './transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from './transport-permissions.guard';
import { TransportAccessService } from '../common/transport-access.service';

@Module({
  controllers: [TransportAuthController],
  providers: [
    TransportAuthService,
    TransportJwtGuard,
    TransportInstituteAdminViewOnlyGuard,
    TransportPermissionsGuard,
    TransportAccessService,
  ],
  exports: [
    TransportAuthService,
    TransportJwtGuard,
    TransportInstituteAdminViewOnlyGuard,
    TransportPermissionsGuard,
    TransportAccessService,
  ],
})
export class TransportAuthModule {}
