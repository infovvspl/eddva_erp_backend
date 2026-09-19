import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CANTEEN_PERMISSIONS_KEY,
  CanteenPermissionRequirement,
} from './require-permissions.decorator';
import {
  CanteenAccessService,
  isCanteenAdmin,
} from '../common/canteen-access.service';

@Injectable()
export class CanteenPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: CanteenAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      CanteenPermissionRequirement[]
    >(CANTEEN_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.canteenUser;
    if (!user) return true; // CanteenJwtGuard handles unauthenticated requests

    if (isCanteenAdmin(user)) return true;

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
