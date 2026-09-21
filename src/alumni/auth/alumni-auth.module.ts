import { Module } from '@nestjs/common';
import { AlumniAuthController } from './alumni-auth.controller';
import { AlumniAuthService } from './alumni-auth.service';
import { AlumniRegistrationService } from './alumni-registration.service';
import { AlumniJwtGuard } from './alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from './alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from './alumni-permissions.guard';
import { AlumniAccessService } from '../common/alumni-access.service';
import { AlumniAuditService } from '../common/alumni-audit.service';
import { AlumniSystemRoleService } from '../common/alumni-system-role.service';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';

/**
 * Auth for the Alumni island: SSO exchange, direct login, alumni
 * self-registration and the guards. The audit / notification / system-role
 * services live here (and are exported) because self-registration needs them and
 * the root module must not be imported back into this one.
 */
@Module({
  controllers: [AlumniAuthController],
  providers: [
    AlumniAuthService,
    AlumniRegistrationService,
    AlumniJwtGuard,
    AlumniInstituteAdminViewOnlyGuard,
    AlumniPermissionsGuard,
    AlumniAccessService,
    AlumniAuditService,
    AlumniSystemRoleService,
    AlumniNotificationService,
  ],
  exports: [
    AlumniAuthService,
    AlumniJwtGuard,
    AlumniInstituteAdminViewOnlyGuard,
    AlumniPermissionsGuard,
    AlumniAccessService,
    AlumniAuditService,
    AlumniSystemRoleService,
    AlumniNotificationService,
  ],
})
export class AlumniAuthModule {}
