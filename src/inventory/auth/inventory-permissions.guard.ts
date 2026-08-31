import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { INVENTORY_PERMISSIONS_KEY, InventoryPermissionRequirement } from './require-permissions.decorator';
import { InventoryAccessService, isInvAdmin } from '../common/inventory-access.service';

@Injectable()
export class InventoryPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: InventoryAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<InventoryPermissionRequirement[]>(
      INVENTORY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.inventoryUser;
    if (!user) return true; // InventoryJwtGuard handles unauthenticated requests

    if (isInvAdmin(user)) return true;

    const { rules, roleName } = await this.access.getPermissionRules(user);

    for (const required of requiredPermissions) {
      const hasPermission = rules.some((rule) => {
        if (!rule || typeof rule !== 'object') return false;
        if (rule.resource !== required.resource) return false;
        return Array.isArray(rule.actions) && rule.actions.includes(required.action);
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
