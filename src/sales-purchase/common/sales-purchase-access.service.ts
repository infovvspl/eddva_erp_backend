import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from './institute-admin-role-names';

interface PermissionRule {
  resource: string;
  actions: string[];
}

/**
 * Previously duplicated as 4 independently-drifting checks (two array
 * literals in sales-purchase-auth.service.ts, one narrower single-string
 * comparison here, and a fourth copy of that narrower check inlined in
 * SalesPurchaseInstituteAdminViewOnlyGuard). All four now use
 * INSTITUTE_ADMIN_ROLE_NAMES from institute-admin-role-names.ts.
 */
export function isSpAdmin(actor: SalesPurchasePlatformUser): boolean {
  return (
    actor.is_institute_admin ||
    INSTITUTE_ADMIN_ROLE_NAMES.includes(actor.user_role as (typeof INSTITUTE_ADMIN_ROLE_NAMES)[number])
  );
}

/**
 * Resolves the acting Sales & Purchase Platform user's permission matrix.
 * Mirrors InventoryAccessService/TransportAccessService's live-lookup logic
 * (role_id → dynamic role row; else eddva_user_id assignment; else
 * JWT-embedded permissions as a last resort) so checks always reflect the
 * current role definition rather than a possibly-stale JWT.
 */
@Injectable()
export class SalesPurchaseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionRules(
    actor: SalesPurchasePlatformUser,
  ): Promise<{ rules: PermissionRule[]; roleName: string }> {
    let rules: PermissionRule[] = [];
    let roleName = actor.role_name || actor.user_role || 'Assigned User';

    if (actor.role_id) {
      const role = await this.prisma.salesPurchaseDynamicRole.findUnique({
        where: { role_id: actor.role_id },
      });
      if (role && Array.isArray(role.permissions)) {
        rules = role.permissions as unknown as PermissionRule[];
        roleName = role.name;
      }
    } else {
      const assignment =
        await this.prisma.salesPurchaseUserDynamicRole.findFirst({
          where: {
            institute_id: actor.institute_id,
            eddva_user_id: actor.eddva_user_id,
            is_active: true,
          },
          include: { role: true },
        });
      if (assignment && Array.isArray(assignment.role.permissions)) {
        rules = assignment.role.permissions as unknown as PermissionRule[];
        roleName = assignment.role.name;
      } else if (Array.isArray(actor.permissions)) {
        rules = actor.permissions;
      }
    }

    return { rules, roleName };
  }

  async hasPermission(
    actor: SalesPurchasePlatformUser,
    resource: string,
    action: string,
  ): Promise<boolean> {
    if (isSpAdmin(actor)) return true;
    const { rules } = await this.getPermissionRules(actor);
    return rules.some(
      (rule) =>
        rule &&
        rule.resource === resource &&
        Array.isArray(rule.actions) &&
        rule.actions.includes(action),
    );
  }

  /**
   * Resolves the acting user's own SalesPurchaseDynamicRole row_id, for
   * role-gated approval checks (module spec §21's approval-rule role
   * matching). Deliberately always re-reads the live, active assignment
   * rather than trusting `actor.role_id` from the JWT — that token can be
   * valid for up to 24h, and approval authority must not survive a
   * revoked or reassigned role for that long. Only called for non-admin
   * actors (callers already short-circuit on isSpAdmin(actor) first).
   */
  async resolveRoleId(
    actor: SalesPurchasePlatformUser,
  ): Promise<number | undefined> {
    const assignment = await this.prisma.salesPurchaseUserDynamicRole.findFirst(
      {
        where: {
          institute_id: actor.institute_id,
          eddva_user_id: actor.eddva_user_id,
          is_active: true,
        },
        select: { role_id: true },
      },
    );
    return assignment?.role_id;
  }
}
