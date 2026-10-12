import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRequest } from './staff-request';
import {
  STAFF_PERMISSIONS_KEY,
  StaffPermissionRequirement,
} from './require-permissions.decorator';
import {
  StaffAccessService,
  isStaffAdmin,
} from '../common/staff-access.service';

@Injectable()
export class StaffPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: StaffAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      StaffPermissionRequirement[]
    >(STAFF_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<StaffRequest>().staffUser;
    if (!user) return true; // StaffJwtGuard handles unauthenticated requests
    if (isStaffAdmin(user)) return true;

    const { rules, roleName } = await this.access.getPermissionRules(user);

    for (const requirement of required) {
      const hasPermission = rules.some(
        (rule) =>
          rule &&
          typeof rule === 'object' &&
          rule.resource === requirement.resource &&
          Array.isArray(rule.actions) &&
          rule.actions.includes(requirement.action),
      );

      if (!hasPermission) {
        throw new ForbiddenException(
          `Forbidden: Your assigned role '${roleName}' lacks required permission '${requirement.action}' on resource '${requirement.resource}'`,
        );
      }
    }

    return true;
  }
}
