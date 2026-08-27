import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FRONT_OFFICE_PERMISSIONS_KEY, FrontOfficePermissionRequirement } from './require-permissions.decorator';
import { FrontOfficeAccessService, isFoAdmin } from '../common/front-office-access.service';

@Injectable()
export class FrontOfficePermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: FrontOfficeAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<FrontOfficePermissionRequirement[]>(
      FRONT_OFFICE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.frontOfficeUser;
    if (!user) return true; // FrontOfficeJwtGuard handles unauthenticated requests

    if (isFoAdmin(user)) return true;

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
