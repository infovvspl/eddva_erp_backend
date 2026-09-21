import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from './institute-admin-role-names';

interface PermissionRule {
  resource: string;
  actions: string[];
}

export interface AlumniAccessContext {
  rules: PermissionRule[];
  roleName: string;
  /** Set when the account is an alumni-portal account; null for staff. */
  alumniId: number | null;
  /** Portal accounts only: the linked profile has been verified by staff. */
  verified: boolean;
}

export function isAlumniAdmin(actor: AlumniPlatformUser): boolean {
  return (
    actor.is_institute_admin ||
    INSTITUTE_ADMIN_ROLE_NAMES.includes(
      actor.user_role as (typeof INSTITUTE_ADMIN_ROLE_NAMES)[number],
    )
  );
}

/**
 * True for alumni-portal accounts. `alumni_id` is only ever populated by
 * AlumniPermissionsGuard from the live database row — never from the JWT — so
 * this cannot be forged by a token claim.
 */
export function isAlumniPrincipal(actor: AlumniPlatformUser): boolean {
  return actor.alumni_id !== undefined && actor.alumni_id !== null;
}

/**
 * Resolves the acting user's permission matrix and identity.
 *
 * Always re-reads the live, active assignment (institute_id + eddva_user_id)
 * and its current role definition — never the claims embedded in the JWT,
 * which can be up to 24h old. No live assignment (revoked / deactivated
 * account, or a deactivated alumni profile) → no context → the guard refuses.
 */
@Injectable()
export class AlumniAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(
    actor: AlumniPlatformUser,
  ): Promise<AlumniAccessContext | null> {
    const assignment = await this.prisma.alumniUserDynamicRole.findFirst({
      where: {
        institute_id: actor.institute_id,
        eddva_user_id: actor.eddva_user_id,
        is_active: true,
      },
      include: {
        role: true,
        alumni: {
          select: {
            alumni_id: true,
            is_active: true,
            verification_status: true,
          },
        },
      },
    });
    if (!assignment) return null;
    if (assignment.alumni_id !== null && !assignment.alumni?.is_active) {
      return null;
    }
    return {
      rules: Array.isArray(assignment.role.permissions)
        ? (assignment.role.permissions as unknown as PermissionRule[])
        : [],
      roleName: assignment.role.name,
      alumniId: assignment.alumni_id,
      verified: assignment.alumni?.verification_status === 'verified',
    };
  }

  async getPermissionRules(
    actor: AlumniPlatformUser,
  ): Promise<{ rules: PermissionRule[]; roleName: string }> {
    const ctx = await this.getContext(actor);
    return {
      rules: ctx?.rules ?? [],
      roleName: ctx?.roleName ?? actor.role_name ?? 'Unassigned',
    };
  }

  async hasPermission(
    actor: AlumniPlatformUser,
    resource: string,
    action: string,
  ): Promise<boolean> {
    if (isAlumniAdmin(actor)) return true;
    const { rules } = await this.getPermissionRules(actor);
    return rules.some(
      (rule) =>
        rule &&
        rule.resource === resource &&
        Array.isArray(rule.actions) &&
        rule.actions.includes(action),
    );
  }

  /** For checks that depend on request data, beyond what @RequirePermission can express. */
  async assertPermission(
    actor: AlumniPlatformUser,
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
