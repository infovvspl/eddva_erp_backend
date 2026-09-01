import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Institute Admins have view-only access to Transport operational tasks
 * (vehicles/routes/passengers/drivers/tracking/fees) — full write access
 * only to Roles & Permissions and Auth sub-routes, so they can configure
 * the module. Mirrors FrontOfficeInstituteAdminViewOnlyGuard/
 * InventoryInstituteAdminViewOnlyGuard exactly.
 */
@Injectable()
export class TransportInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.transportUser;

    if (!user) return true; // TransportJwtGuard handles unauthenticated requests

    const isInstituteAdmin = user.is_institute_admin || user.user_role === 'INSTITUTE_ADMIN';
    if (!isInstituteAdmin) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];

    const path: string = req.path || req.url || '';
    if (path.includes('/transport/roles') || path.includes('/transport/permissions') || path.includes('/transport/auth')) {
      return true;
    }

    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Transport operational tasks. ' +
        'Please use an account with an assigned Transport role (Admin/Dispatcher/Driver App User) to perform write actions.',
      );
    }

    return true;
  }
}
