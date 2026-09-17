import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { isSpAdmin } from '../common/sales-purchase-access.service';

/**
 * Institute Admins have view-only access to Sales & Purchase operational
 * tasks (vendors/customers/items/purchase orders/GRNs/invoices/payments/
 * sales orders/receipts/reports). Mirrors
 * InventoryInstituteAdminViewOnlyGuard/TransportInstituteAdminViewOnlyGuard.
 *
 * There used to be a path-substring exemption here for the Roles &
 * Permissions and Auth routes ("/sales-purchase/roles" etc. always passes")
 * — it was dead code: this guard is never attached to
 * SalesPurchaseDynamicRolesController, SalesPurchasePermissionsRegistryController,
 * or SalesPurchaseAuthController (`@UseGuards` on those only lists
 * SalesPurchaseJwtGuard), so requests to those paths never reach this
 * guard's canActivate() at all. Institute Admin write access there is
 * enforced by requireInstituteAdmin()/isSpAdmin() inside those services
 * directly. Removed rather than replaced with route metadata, since the
 * case it guarded against doesn't currently occur.
 */
@Injectable()
export class SalesPurchaseInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.salesPurchaseUser;

    if (!user) return true; // SalesPurchaseJwtGuard handles unauthenticated requests
    if (!isSpAdmin(user)) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Sales & Purchase operational tasks. ' +
          'Please use an account with an assigned Sales & Purchase role (Purchase Clerk/Sales Clerk/Approver/Accounts) to perform write actions.',
      );
    }

    return true;
  }
}
