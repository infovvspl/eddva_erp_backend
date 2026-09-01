import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TRANSPORT_PERMISSIONS_KEY, TransportPermissionRequirement } from './require-permissions.decorator';
import { TransportAccessService, isTransportAdmin } from '../common/transport-access.service';

@Injectable()
export class TransportPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TransportAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<TransportPermissionRequirement[]>(
      TRANSPORT_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.transportUser;
    if (!user) return true; // TransportJwtGuard handles unauthenticated requests

    if (isTransportAdmin(user)) return true;

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
