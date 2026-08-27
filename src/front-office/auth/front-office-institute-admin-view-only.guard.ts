import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Institute Admins have view-only access to Front Office operational tasks
 * (visitors/enquiries/appointments/complaints) — full write access only to
 * Roles & Permissions and Auth sub-routes, so they can configure the module.
 */
@Injectable()
export class FrontOfficeInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.frontOfficeUser;

    if (!user) return true; // FrontOfficeJwtGuard handles unauthenticated requests

    const isInstituteAdmin = user.is_institute_admin || user.user_role === 'INSTITUTE_ADMIN';
    if (!isInstituteAdmin) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];

    const path: string = req.path || req.url || '';
    if (path.includes('/front-office/roles') || path.includes('/front-office/permissions') || path.includes('/front-office/auth')) {
      return true;
    }

    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Front Office operational tasks. ' +
        'Please use an account with an assigned Front Office role (Front Desk/Department Staff/Manager) to perform write actions.',
      );
    }

    return true;
  }
}
