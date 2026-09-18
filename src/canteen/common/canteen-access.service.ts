import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../auth/institute-admin-role-names';

export function isCanteenAdmin(actor: CanteenPlatformUser): boolean {
  return (
    actor.is_institute_admin ||
    INSTITUTE_ADMIN_ROLE_NAMES.includes(actor.user_role as (typeof INSTITUTE_ADMIN_ROLE_NAMES)[number])
  );
}

/**
 * Resolves the acting Canteen Platform user's permission-key set. Unlike
 * Sales-Purchase's single-role-per-assignment model, Canteen supports
 * multiple CanteenRole assignments per CanteenUser, so this returns the
 * union of every assigned role's permission keys — always a live DB read,
 * never trusting anything embedded in the JWT (the Canteen token carries no
 * permissions/role data at all, only the actor's identity).
 */
@Injectable()
export class CanteenAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionKeys(actor: CanteenPlatformUser): Promise<Set<string>> {
    const assignments = await this.prisma.canteenUserRole.findMany({
      where: { userId: actor.id },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      for (const rp of assignment.role.rolePermissions) {
        keys.add(rp.permission.key);
      }
    }
    return keys;
  }
}
