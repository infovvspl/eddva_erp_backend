import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated.');
    }

    // Global SUPER_ADMIN and Institute Administrator bypass all permission checks
    const roleStr = (user.role || user.roleName || '').toString().toUpperCase();
    if (
      roleStr === 'SUPER_ADMIN' ||
      roleStr === 'INSTITUTE ADMINISTRATOR' ||
      roleStr === 'INSTITUTE_ADMIN'
    ) {
      return true;
    }

    const userId = user.id || user.userId;
    if (!userId) {
      throw new ForbiddenException('Invalid user context.');
    }

    // Query live user permissions from database
    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
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

    if (!dbUser || dbUser.status !== 'ACTIVE' || !dbUser.role || dbUser.role.status !== 'ACTIVE') {
      throw new ForbiddenException('User or assigned role is inactive.');
    }

    const dbRoleStr = (dbUser.role.roleName || '').toUpperCase();
    if (
      dbRoleStr === 'SUPER_ADMIN' ||
      dbRoleStr === 'INSTITUTE ADMINISTRATOR' ||
      dbRoleStr === 'INSTITUTE_ADMIN'
    ) {
      return true;
    }

    const userPermissions = dbUser.role.rolePermissions.map(
      (rp) => rp.permission.permissionKey,
    );

    const aliasMap: Record<string, string[]> = {
      'vendor.view': ['vendor.view', 'purchase.vendor.view'],
      'vendor.create': ['vendor.create', 'purchase.vendor.create'],
      'vendor.edit': ['vendor.edit', 'purchase.vendor.update'],
      'customer.view': ['customer.view', 'sales.customer.view'],
      'customer.create': ['customer.create', 'sales.customer.create'],
      'customer.edit': ['customer.edit', 'sales.customer.update'],
      'item.view': ['item.view', 'master.item.view'],
      'purchase_order.view': ['purchase_order.view', 'purchase.po.view'],
      'sales_order.view': ['sales_order.view', 'sales.order.view'],
    };

    const hasPermission = requiredPermissions.every((permission) => {
      const allowedKeys = aliasMap[permission] || [permission];
      return allowedKeys.some((k) => userPermissions.includes(k));
    });

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required permission(s): ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}

