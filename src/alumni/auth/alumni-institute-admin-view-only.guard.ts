import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { isAlumniAdmin } from '../common/alumni-access.service';
import type { AlumniRequest } from './alumni-request';

/**
 * Institute Admins have view-only access to Alumni operational tasks
 * (directory, verification, events, jobs, mentorship, campaigns, donations,
 * newsletters, reports). Mirrors HostelInstituteAdminViewOnlyGuard.
 *
 * Not attached to AlumniDynamicRolesController,
 * AlumniPermissionsRegistryController or AlumniAuthController —
 * Institute Admin write access there is enforced by requireInstituteAdmin()
 * inside those services directly.
 */
@Injectable()
export class AlumniInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AlumniRequest>();
    const user = req.alumniUser;

    if (!user) return true; // AlumniJwtGuard handles unauthenticated requests
    if (!isAlumniAdmin(user)) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Alumni operational tasks. ' +
          'Please use an account with an assigned Alumni role (Alumni Relations Officer/etc.) to perform write actions.',
      );
    }

    return true;
  }
}
