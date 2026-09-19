import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { isAdmissionAdmin } from '../common/admission-access.service';
import type { AdmissionRequest } from './admission-request';

/**
 * Institute Admins have view-only access to Admission operational tasks
 * (enquiries/applications/tests/interviews/merit/offers/fees/confirmations/
 * reports). Mirrors CanteenInstituteAdminViewOnlyGuard.
 *
 * Not attached to AdmissionDynamicRolesController,
 * AdmissionPermissionsRegistryController or AdmissionAuthController —
 * Institute Admin write access there is enforced by requireInstituteAdmin()
 * inside those services directly.
 */
@Injectable()
export class AdmissionInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdmissionRequest>();
    const user = req.admissionUser;

    if (!user) return true; // AdmissionJwtGuard handles unauthenticated requests
    if (!isAdmissionAdmin(user)) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Admission operational tasks. ' +
          'Please use an account with an assigned Admission role (Admission Officer/Interview Evaluator/etc.) to perform write actions.',
      );
    }

    return true;
  }
}
