import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { isCanteenAdmin } from '../common/canteen-access.service';

/**
 * Institute Admins have view-only access to Canteen operational tasks
 * (menu/members/orders/payments/POS/wallet/reports). Mirrors
 * SalesPurchaseInstituteAdminViewOnlyGuard/InventoryInstituteAdminViewOnlyGuard.
 * Not attached to CanteenAuthController or CanteenRbacController — Institute
 * Admin write access on those is enforced by isCanteenAdmin() checks inside
 * the relevant services/guards directly.
 */
@Injectable()
export class CanteenInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.canteenUser;

    if (!user) return true; // CanteenJwtGuard handles unauthenticated requests
    if (!isCanteenAdmin(user)) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Canteen operational tasks. ' +
          'Please use an account with an assigned Canteen role to perform write actions.',
      );
    }

    return true;
  }
}
