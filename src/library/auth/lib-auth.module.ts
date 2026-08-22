import { Module } from '@nestjs/common';
import { LibAuthController } from './lib-auth.controller';
import { LibAuthService } from './lib-auth.service';
import { LibJwtGuard } from './lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from './lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from './lib-permissions.guard';

@Module({
  controllers: [LibAuthController],
  providers: [
    LibAuthService,
    LibJwtGuard,
    LibInstituteAdminViewOnlyGuard,
    LibPermissionsGuard,
  ],
  exports: [
    LibAuthService,
    LibJwtGuard,
    LibInstituteAdminViewOnlyGuard,
    LibPermissionsGuard,
  ],
})
export class LibAuthModule {}
