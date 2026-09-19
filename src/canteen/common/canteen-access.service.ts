import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from './institute-admin-role-names';

interface PermissionRule {
  resource: string;
  actions: string[];
}

export function isCanteenAdmin(actor: CanteenPlatformUser): boolean {
  return (
    actor.is_institute_admin ||
    INSTITUTE_ADMIN_ROLE_NAMES.includes(
      actor.user_role as (typeof INSTITUTE_ADMIN_ROLE_NAMES)[number],
    )
  );
}

/**
 * Resolves the acting Canteen Platform user's permission matrix.
 *
 * Always re-reads the live, active assignment (institute_id + eddva_user_id)
 * and its current role definition — never the `role_id`/`permissions`
 * embedded in the JWT. Those claims can be up to 24h old, so trusting them
 * would let a revoked, deactivated or re-roled user keep their old access
 * until the token expires. No live assignment → no permissions.
 */
@Injectable()
export class CanteenAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionRules(
    actor: CanteenPlatformUser,
  ): Promise<{ rules: PermissionRule[]; roleName: string }> {
    const assignment = await this.prisma.canteenUserDynamicRole.findFirst({
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
    actor: CanteenPlatformUser,
    resource: string,
    action: string,
  ): Promise<boolean> {
    if (isCanteenAdmin(actor)) return true;
    const { rules } = await this.getPermissionRules(actor);
    return rules.some(
      (rule) =>
        rule &&
        rule.resource === resource &&
        Array.isArray(rule.actions) &&
        rule.actions.includes(action),
    );
  }
}
