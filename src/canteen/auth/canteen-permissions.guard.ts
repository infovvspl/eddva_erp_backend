import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CANTEEN_PERMISSIONS_KEY } from '../decorators/require-canteen-permission.decorator';
import { CanteenAccessService, isCanteenAdmin } from '../common/canteen-access.service';

@Injectable()
export class CanteenPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private access: CanteenAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      CANTEEN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.canteenUser;
    if (!user) {
      throw new ForbiddenException('User not authenticated.');
    }

    if (isCanteenAdmin(user)) {
      return true;
    }

    // CRITICAL SECURITY RULE: Only Institute Admin can manage Canteen Roles & Permissions
    const isRbacManagementRoute = requiredPermissions?.some(
      (p) => p.startsWith('canteen.role.') || p.startsWith('canteen.permission.'),
    );

    if (isRbacManagementRoute) {
      throw new ForbiddenException(
        'Access Denied: Only Institute Administrator can manage Canteen Roles and Permissions.',
      );
    }

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const userCanteenPermKeys = await this.access.getPermissionKeys(user);

    const hasPermission = requiredPermissions.every((perm) =>
      userCanteenPermKeys.has(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required Canteen permission(s): ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
