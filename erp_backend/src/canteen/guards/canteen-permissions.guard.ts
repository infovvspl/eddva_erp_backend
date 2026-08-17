import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CANTEEN_PERMISSIONS_KEY } from '../decorators/require-canteen-permission.decorator';

@Injectable()
export class CanteenPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      CANTEEN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated.');
    }

    const roleStr = (user.role || user.roleName || '').toString().toUpperCase();
    const isInstituteAdmin =
      roleStr === 'SUPER_ADMIN' ||
      roleStr === 'INSTITUTE ADMINISTRATOR' ||
      roleStr === 'INSTITUTE_ADMIN';

    // Check live database user role for Institute Admin
    const userId = user.id || user.userId;
    if (userId && !isInstituteAdmin) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });
      if (dbUser && dbUser.role) {
        const dbRoleStr = dbUser.role.roleName.toUpperCase();
        if (
          dbRoleStr === 'SUPER_ADMIN' ||
          dbRoleStr === 'INSTITUTE ADMINISTRATOR' ||
          dbRoleStr === 'INSTITUTE_ADMIN'
        ) {
          // Institute Admin automatically gets full access to all Canteen APIs
          return true;
        }
      }
    }

    // Institute Admin bypasses all checks
    if (isInstituteAdmin) {
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

    // For normal Canteen business operations, verify CanteenUserRole -> CanteenRolePermission -> CanteenPermission
    const canteenUserRoles = await this.prisma.canteenUserRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const userCanteenPermKeys = new Set<string>();
    for (const ur of canteenUserRoles) {
      for (const rp of ur.role.rolePermissions) {
        userCanteenPermKeys.add(rp.permission.key);
      }
    }

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
