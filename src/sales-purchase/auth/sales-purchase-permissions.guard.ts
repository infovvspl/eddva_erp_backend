import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SALES_PURCHASE_PERMISSIONS_KEY,
  SalesPurchasePermissionRequirement,
} from './require-permissions.decorator';
import {
  SalesPurchaseAccessService,
  isSpAdmin,
} from '../common/sales-purchase-access.service';

@Injectable()
export class SalesPurchasePermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SalesPurchaseAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      SalesPurchasePermissionRequirement[]
    >(SALES_PURCHASE_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.salesPurchaseUser;
    if (!user) return true; // SalesPurchaseJwtGuard handles unauthenticated requests

    if (isSpAdmin(user)) return true;

    const { rules, roleName } = await this.access.getPermissionRules(user);

    for (const required of requiredPermissions) {
      const hasPermission = rules.some((rule) => {
        if (!rule || typeof rule !== 'object') return false;
        if (rule.resource !== required.resource) return false;
        return (
          Array.isArray(rule.actions) && rule.actions.includes(required.action)
        );
      });

      if (!hasPermission) {
        throw new ForbiddenException(
          `Forbidden: Your assigned role '${roleName}' lacks required permission '${required.action}' on resource '${required.resource}'`,
        );
      }
    }

    return true;
  }
}
