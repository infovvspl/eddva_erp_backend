import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdmissionRequest } from './admission-request';
import {
  ADMISSION_PERMISSIONS_KEY,
  AdmissionPermissionRequirement,
} from './require-permissions.decorator';
import {
  AdmissionAccessService,
  isAdmissionAdmin,
} from '../common/admission-access.service';

@Injectable()
export class AdmissionPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AdmissionAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      AdmissionPermissionRequirement[]
    >(ADMISSION_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context
      .switchToHttp()
      .getRequest<AdmissionRequest>().admissionUser;
    if (!user) return true; // AdmissionJwtGuard handles unauthenticated requests
    if (isAdmissionAdmin(user)) return true;

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
