import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from './institute-admin-role-names';

interface PermissionRule {
  resource: string;
  actions: string[];
}

export function isHostelAdmin(actor: HostelPlatformUser): boolean {
  return (
    actor.is_institute_admin ||
    INSTITUTE_ADMIN_ROLE_NAMES.includes(
      actor.user_role as (typeof INSTITUTE_ADMIN_ROLE_NAMES)[number],
    )
  );
}

/**
 * Resolves the acting Hostel user's permission matrix.
 *
 * Always re-reads the live, active assignment (institute_id + eddva_user_id)
 * and its current role definition — never the `role_id`/`permissions`
 * embedded in the JWT. Those claims can be up to 24h old, so trusting them
 * would let a revoked, deactivated or re-roled user keep their old access
 * until the token expires. No live assignment → no permissions.
 */
@Injectable()
export class HostelAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionRules(
    actor: HostelPlatformUser,
  ): Promise<{ rules: PermissionRule[]; roleName: string }> {
    const assignment = await this.prisma.hostelUserDynamicRole.findFirst({
      where: {
        institute_id: actor.institute_id,
        eddva_user_id: actor.eddva_user_id,
        is_active: true,
      },
      include: { role: true },
    });

    if (!assignment) {
      return { rules: [], roleName: actor.role_name || 'Unassigned' };
    }

    const rules = Array.isArray(assignment.role.permissions)
      ? (assignment.role.permissions as unknown as PermissionRule[])
      : [];
    return { rules, roleName: assignment.role.name };
  }

  async hasPermission(
    actor: HostelPlatformUser,
    resource: string,
    action: string,
  ): Promise<boolean> {
    if (isHostelAdmin(actor)) return true;
    const { rules } = await this.getPermissionRules(actor);
    return rules.some(
      (rule) =>
        rule &&
        rule.resource === resource &&
        Array.isArray(rule.actions) &&
        rule.actions.includes(action),
    );
  }

  /** For checks that depend on request data (e.g. the target status), beyond what @RequirePermission can express. */
  async assertPermission(
    actor: HostelPlatformUser,
    resource: string,
    action: string,
    message?: string,
  ): Promise<void> {
    if (!(await this.hasPermission(actor, resource, action))) {
      throw new ForbiddenException(
        message ??
          `Forbidden: you lack the '${action}' permission on '${resource}'`,
      );
    }
  }
}
