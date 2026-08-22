import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SPORTS_PERMISSIONS_KEY, SportsPermissionRequirement } from './require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface PermissionRule {
  resource: string;
  actions: string[];
}

@Injectable()
export class SportsPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<SportsPermissionRequirement[]>(
      SPORTS_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const sportsUser = req.sportsUser;
    if (!sportsUser) return true;

    if (sportsUser.is_institute_admin || sportsUser.user_role === 'INSTITUTE_ADMIN') {
      return true;
    }

    let userPermissions: PermissionRule[] = [];
    let roleName = sportsUser.role_name || sportsUser.user_role || 'Assigned User';

    if (sportsUser.role_id) {
      const role = await this.prisma.sportsDynamicRole.findUnique({
        where: { role_id: sportsUser.role_id },
      });
      if (role && Array.isArray(role.permissions)) {
        userPermissions = role.permissions as unknown as PermissionRule[];
        roleName = role.name;
      }
    } else {
      const assignment = await this.prisma.sportsUserDynamicRole.findFirst({
        where: {
          institute_id: sportsUser.institute_id,
          eddva_user_id: sportsUser.eddva_user_id,
          is_active: true,
        },
        include: { role: true },
      });
      if (assignment && Array.isArray(assignment.role.permissions)) {
        userPermissions = assignment.role.permissions as unknown as PermissionRule[];
        roleName = assignment.role.name;
      } else if (Array.isArray(sportsUser.permissions)) {
        userPermissions = sportsUser.permissions as unknown as PermissionRule[];
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
