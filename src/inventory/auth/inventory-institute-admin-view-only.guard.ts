import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Institute Admins have view-only access to Inventory operational tasks
 * (items/stock/issues/returns/assets/maintenance) — full write access only
 * to Roles & Permissions and Auth sub-routes, so they can configure the
 * module. Mirrors FrontOfficeInstituteAdminViewOnlyGuard/
 * SportsInstituteAdminViewOnlyGuard exactly.
 */
@Injectable()
export class InventoryInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.inventoryUser;

    if (!user) return true; // InventoryJwtGuard handles unauthenticated requests

    const isInstituteAdmin = user.is_institute_admin || user.user_role === 'INSTITUTE_ADMIN';
    if (!isInstituteAdmin) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];

    const path: string = req.path || req.url || '';
    if (path.includes('/inventory/roles') || path.includes('/inventory/permissions') || path.includes('/inventory/auth')) {
      return true;
    }

    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Inventory operational tasks. ' +
        'Please use an account with an assigned Inventory role (Admin/Store Keeper/Approver) to perform write actions.',
      );
    }

    return true;
  }
}
