import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Institute Admins have view-only access to Sales & Purchase operational
 * tasks (vendors/customers/items/purchase orders/GRNs/invoices/payments/
 * sales orders/receipts/reports) — full write access only to Roles &
 * Permissions and Auth sub-routes, so they can configure the module.
 * Mirrors InventoryInstituteAdminViewOnlyGuard/
 * TransportInstituteAdminViewOnlyGuard exactly.
 */
@Injectable()
export class SalesPurchaseInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.salesPurchaseUser;

    if (!user) return true; // SalesPurchaseJwtGuard handles unauthenticated requests

    const isInstituteAdmin =
      user.is_institute_admin || user.user_role === 'INSTITUTE_ADMIN';
    if (!isInstituteAdmin) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];

    const path: string = req.path || req.url || '';
    if (
      path.includes('/sales-purchase/roles') ||
      path.includes('/sales-purchase/permissions') ||
      path.includes('/sales-purchase/auth')
    ) {
      return true;
    }

    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Sales & Purchase operational tasks. ' +
          'Please use an account with an assigned Sales & Purchase role (Purchase Clerk/Sales Clerk/Approver/Accounts) to perform write actions.',
      );
    }

    return true;
  }
}
