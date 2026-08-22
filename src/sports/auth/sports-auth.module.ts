import { Module } from '@nestjs/common';
import { SportsAuthController } from './sports-auth.controller';
import { SportsAuthService } from './sports-auth.service';
import { SportsJwtGuard } from './sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from './sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from './sports-permissions.guard';

@Module({
  controllers: [SportsAuthController],
  providers: [
    SportsAuthService,
    SportsJwtGuard,
    SportsInstituteAdminViewOnlyGuard,
    SportsPermissionsGuard,
  ],
  exports: [
    SportsAuthService,
    SportsJwtGuard,
    SportsInstituteAdminViewOnlyGuard,
    SportsPermissionsGuard,
  ],
})
export class SportsAuthModule {}
