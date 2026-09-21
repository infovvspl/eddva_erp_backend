import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AlumniRequest } from './alumni-request';
import {
  ALUMNI_PERMISSIONS_KEY,
  ALUMNI_STAFF_ONLY_KEY,
  AlumniPermissionRequirement,
} from './require-permissions.decorator';
import {
  AlumniAccessService,
  isAlumniAdmin,
} from '../common/alumni-access.service';

@Injectable()
export class AlumniPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AlumniAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AlumniRequest>();
    const user = req.alumniUser;
    if (!user) return true; // AlumniJwtGuard handles unauthenticated requests
    if (isAlumniAdmin(user)) return true;

    // Identity is resolved BEFORE looking at the route's requirement, so even a
    // route without @RequirePermission cannot be reached by a revoked account,
    // and a portal account is always recognised as such.
    const ctx = await this.access.getContext(user);
    if (!ctx) {
      throw new ForbiddenException(
        'Your Alumni account is inactive or has been revoked',
      );
    }
    user.alumni_id = ctx.alumniId ?? undefined;
    user.alumni_verified = ctx.verified;

    const staffOnly = this.reflector.getAllAndOverride<boolean>(
      ALUMNI_STAFF_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (staffOnly && ctx.alumniId !== null) {
      throw new ForbiddenException(
        'This action is reserved for alumni-office staff',
      );
    }

    const required = this.reflector.getAllAndOverride<
      AlumniPermissionRequirement[]
    >(ALUMNI_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    for (const requirement of required) {
      const hasPermission = ctx.rules.some(
        (rule) =>
          rule &&
          typeof rule === 'object' &&
          rule.resource === requirement.resource &&
          Array.isArray(rule.actions) &&
          rule.actions.includes(requirement.action),
      );

      if (!hasPermission) {
        throw new ForbiddenException(
          `Forbidden: Your assigned role '${ctx.roleName}' lacks required permission '${requirement.action}' on resource '${requirement.resource}'`,
        );
      }
    }

    return true;
  }
}
