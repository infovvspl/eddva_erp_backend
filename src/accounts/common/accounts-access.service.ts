import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

interface PermissionRule {
  resource: string;
  actions: string[];
}

export function isAccountsAdmin(actor: AccountsPlatformUser): boolean {
  return actor.is_institute_admin || actor.user_role === 'INSTITUTE_ADMIN';
}

/**
 * Resolves the acting Accounts Platform user's permission matrix. Mirrors
 * InventoryAccessService's live-lookup logic (role_id → dynamic role row;
 * else eddva_user_id assignment; else JWT-embedded permissions as a last
 * resort) so checks always reflect the current role definition rather than a
 * possibly-stale JWT.
 */
@Injectable()
export class AccountsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionRules(actor: AccountsPlatformUser): Promise<{ rules: PermissionRule[]; roleName: string }> {
    let rules: PermissionRule[] = [];
    let roleName = actor.role_name || actor.user_role || 'Assigned User';

    if (actor.role_id) {
      const role = await this.prisma.accountsDynamicRole.findUnique({ where: { role_id: actor.role_id } });
      if (role && Array.isArray(role.permissions)) {
        rules = role.permissions as unknown as PermissionRule[];
        roleName = role.name;
      }
    } else {
      const assignment = await this.prisma.accountsUserDynamicRole.findFirst({
        where: { institute_id: actor.institute_id, eddva_user_id: actor.eddva_user_id, is_active: true },
        include: { role: true },
      });
      if (assignment && Array.isArray(assignment.role.permissions)) {
        rules = assignment.role.permissions as unknown as PermissionRule[];
        roleName = assignment.role.name;
      } else if (Array.isArray(actor.permissions)) {
        rules = actor.permissions as unknown as PermissionRule[];
      }
    }

    return { rules, roleName };
  }

  async hasPermission(actor: AccountsPlatformUser, resource: string, action: string): Promise<boolean> {
    if (isAccountsAdmin(actor)) return true;
    const { rules } = await this.getPermissionRules(actor);
    return rules.some((rule) => rule && rule.resource === resource && Array.isArray(rule.actions) && rule.actions.includes(action));
  }
}
