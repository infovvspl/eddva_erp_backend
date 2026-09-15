import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';

interface PermissionRule {
  resource: string;
  actions: string[];
}

export function isSpAdmin(actor: SalesPurchasePlatformUser): boolean {
  return actor.is_institute_admin || actor.user_role === 'INSTITUTE_ADMIN';
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

  /** Resolves the acting user's own SalesPurchaseDynamicRole row_id, for role-gated approval checks. */
  async resolveRoleId(
    actor: SalesPurchasePlatformUser,
  ): Promise<number | undefined> {
    if (actor.role_id) return actor.role_id;
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
