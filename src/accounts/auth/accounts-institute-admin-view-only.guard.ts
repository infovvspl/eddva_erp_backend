import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Institute Admins have view-only access to Accounts operational tasks
 * (vouchers/ledger/reports/CoA) — full write access only to Roles &
 * Permissions and Auth sub-routes, so they can configure the module. Mirrors
 * InventoryInstituteAdminViewOnlyGuard/FrontOfficeInstituteAdminViewOnlyGuard
 * exactly.
 */
@Injectable()
export class AccountsInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.accountsUser;

    if (!user) return true; // AccountsJwtGuard handles unauthenticated requests

    const isInstituteAdmin = user.is_institute_admin || user.user_role === 'INSTITUTE_ADMIN';
    if (!isInstituteAdmin) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];

    const path: string = req.path || req.url || '';
    if (path.includes('/accounts/roles') || path.includes('/accounts/permissions') || path.includes('/accounts/auth')) {
      return true;
    }

    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Accounts operational tasks. ' +
        'Please use an account with an assigned Accounts role (Accounts Clerk/Accountant/Finance Admin) to perform write actions.',
      );
    }

    return true;
  }
}
