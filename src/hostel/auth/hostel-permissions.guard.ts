import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { HostelRequest } from './hostel-request';
import {
  HOSTEL_PERMISSIONS_KEY,
  HostelPermissionRequirement,
} from './require-permissions.decorator';
import {
  HostelAccessService,
  isHostelAdmin,
} from '../common/hostel-access.service';

@Injectable()
export class HostelPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: HostelAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      HostelPermissionRequirement[]
    >(HOSTEL_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<HostelRequest>().hostelUser;
    if (!user) return true; // HostelJwtGuard handles unauthenticated requests
    if (isHostelAdmin(user)) return true;

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
