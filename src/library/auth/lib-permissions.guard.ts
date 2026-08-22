import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionRequirement } from './require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface PermissionRule {
  resource: string;
  actions: string[];
}

/**
 * LibPermissionsGuard — enforces dynamic Resource + Action permission matrix checks.
 *
 * Flow:
 *  1. Retrieves required { resource, action } pairs from metadata.
 *  2. Bypasses check for Institute Admin (ViewOnlyGuard still enforces view-only on write methods).
 *  3. Queries DB for user's assigned role permission matrix.
 *  4. Evaluates if user's role has the required action enabled for target resource.
 */
@Injectable()
export class LibPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permission restrictions on this endpoint
    }

    const req = context.switchToHttp().getRequest();
    const libUser = req.libUser;
    if (!libUser) return true; // LibJwtGuard handles unauthenticated requests

    // Institute Admin has full visibility (ViewOnlyGuard blocks write mutations)
    if (libUser.is_institute_admin || libUser.user_role === 'INSTITUTE_ADMIN') {
      return true;
    }

    let userPermissions: PermissionRule[] = [];
    let roleName = libUser.role_name || libUser.user_role || 'Assigned User';

    if (libUser.role_id) {
      const role = await this.prisma.libDynamicRole.findUnique({
        where: { role_id: libUser.role_id },
      });
      if (role && Array.isArray(role.permissions)) {
        userPermissions = role.permissions as unknown as PermissionRule[];
        roleName = role.name;
      }
    } else {
      const assignment = await this.prisma.libUserDynamicRole.findFirst({
        where: {
          institute_id: libUser.institute_id,
          eddva_user_id: libUser.eddva_user_id,
          is_active: true,
        },
        include: { role: true },
      });
      if (assignment && Array.isArray(assignment.role.permissions)) {
        userPermissions = assignment.role.permissions as unknown as PermissionRule[];
        roleName = assignment.role.name;
      } else if (Array.isArray(libUser.permissions)) {
        userPermissions = libUser.permissions as unknown as PermissionRule[];
      }
    }

    for (const required of requiredPermissions) {
      const hasPermission = userPermissions.some((rule) => {
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
