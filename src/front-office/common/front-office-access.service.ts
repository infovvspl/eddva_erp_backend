import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FrontOfficePlatformUser } from '../auth/front-office-auth.service';

export type FoScopeType = 'all' | 'department' | 'assigned';

export interface FoScope {
  isAdmin: boolean;
  employeeId: number | null;
  departmentId: number | null;
  scope: FoScopeType;
}

interface PermissionRule {
  resource: string;
  actions: string[];
}

export function isFoAdmin(actor: FrontOfficePlatformUser): boolean {
  return actor.is_institute_admin || actor.user_role === 'INSTITUTE_ADMIN';
}

/**
 * Resolves the acting Front Office Platform user into RBAC scope/permissions.
 * Mirrors SportsPermissionsGuard's live-lookup logic (role_id → dynamic role
 * row; else eddva_user_id assignment; else JWT-embedded permissions as a
 * last resort) so permission checks always reflect the current role
 * definition rather than a possibly-stale JWT.
 */
@Injectable()
export class FrontOfficeAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionRules(actor: FrontOfficePlatformUser): Promise<{ rules: PermissionRule[]; roleName: string }> {
    let rules: PermissionRule[] = [];
    let roleName = actor.role_name || actor.user_role || 'Assigned User';

    if (actor.role_id) {
      const role = await this.prisma.frontOfficeDynamicRole.findUnique({ where: { role_id: actor.role_id } });
      if (role && Array.isArray(role.permissions)) {
        rules = role.permissions as unknown as PermissionRule[];
        roleName = role.name;
      }
    } else {
      const assignment = await this.prisma.frontOfficeUserDynamicRole.findFirst({
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

  async hasPermission(actor: FrontOfficePlatformUser, resource: string, action: string): Promise<boolean> {
    if (isFoAdmin(actor)) return true;
    const { rules } = await this.getPermissionRules(actor);
    return rules.some((rule) => rule && rule.resource === resource && Array.isArray(rule.actions) && rule.actions.includes(action));
  }

  async resolveScope(actor: FrontOfficePlatformUser): Promise<FoScope> {
    if (isFoAdmin(actor)) {
      return { isAdmin: true, employeeId: null, departmentId: null, scope: 'all' };
    }

    const roleStr = (actor.role_name || actor.user_role || '').toUpperCase();
    const isManager = roleStr.includes('MANAGER');
    const isDeptStaff = roleStr.includes('DEPARTMENT STAFF') || roleStr.includes('DEPT_STAFF') || roleStr.includes('DEPT STAFF');

    if (!isManager && !isDeptStaff) {
      // front_desk (or any other role holding the base permission) sees everything
      return { isAdmin: false, employeeId: null, departmentId: null, scope: 'all' };
    }

    const email = actor.user_email;
    const employee = email
      ? await this.prisma.frontOfficeEmployee.findUnique({ where: { email } })
      : null;

    if (!employee) {
      throw new ForbiddenException(
        'Your account is not linked to a Front Office employee record. Ask an administrator to add you as an employee with a matching email.',
      );
    }

    return {
      isAdmin: false,
      employeeId: employee.employee_id,
      departmentId: employee.department_id,
      scope: isManager ? 'department' : 'assigned',
    };
  }

  /** Applies scope to entities that carry a flat department_id column (appointments). */
  hostScopedWhere(scope: FoScope): Record<string, any> {
    if (scope.scope === 'all') return {};
    if (scope.scope === 'department') return { department_id: scope.departmentId };
    return { host_employee_id: scope.employeeId };
  }

  /** Applies scope to entities that only carry host_employee_id, with department resolved via the host relation (visitor logs). */
  hostRelationScopedWhere(scope: FoScope): Record<string, any> {
    if (scope.scope === 'all') return {};
    if (scope.scope === 'department') return { host_employee: { department_id: scope.departmentId } };
    return { host_employee_id: scope.employeeId };
  }

  /** Applies scope to entities that carry assigned_to (enquiries, complaints). */
  assignedScopedWhere(scope: FoScope): Record<string, any> {
    if (scope.scope === 'all') return {};
    if (scope.scope === 'department') return { assignee: { department_id: scope.departmentId } };
    return { assigned_to: scope.employeeId };
  }
}
