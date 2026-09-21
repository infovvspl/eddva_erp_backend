import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { isHostelAdmin } from '../common/hostel-access.service';
import type { HostelRequest } from './hostel-request';

/**
 * Institute Admins have view-only access to Hostel operational tasks
 * (blocks/rooms/residents/allotments/gate passes/attendance/visitors/mess/
 * complaints/fees/discipline/reports). Mirrors CanteenInstituteAdminViewOnlyGuard.
 *
 * Not attached to HostelDynamicRolesController,
 * HostelPermissionsRegistryController or HostelAuthController —
 * Institute Admin write access there is enforced by requireInstituteAdmin()
 * inside those services directly.
 */
@Injectable()
export class HostelInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HostelRequest>();
    const user = req.hostelUser;

    if (!user) return true; // HostelJwtGuard handles unauthenticated requests
    if (!isHostelAdmin(user)) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Hostel operational tasks. ' +
          'Please use an account with an assigned Hostel role (Warden/Gate Security/etc.) to perform write actions.',
      );
    }

    return true;
  }
}
