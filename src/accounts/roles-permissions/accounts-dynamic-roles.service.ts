import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountsDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateAccountsDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignAccountsUserToRoleDto } from './dto/assign-user.dto';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { AccountsPermissionsRegistryService } from './accounts-permissions-registry.service';
import { AccountsAccessService, isAccountsAdmin } from '../common/accounts-access.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AccountsDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: AccountsPermissionsRegistryService,
    private readonly access: AccountsAccessService,
  ) {}

  /** Returns the dynamic resource & action catalog definitions fetched live from PostgreSQL DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(actor: AccountsPlatformUser, dto: CreateAccountsDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    const existing = await this.prisma.accountsDynamicRole.findUnique({
      where: { institute_id_name: { institute_id: actor.institute_id, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists for this institute`);
    }
    return this.prisma.accountsDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions: (dto.permissions as unknown as Prisma.InputJsonValue) ?? [],
      },
    });
  }

  async listRoles(actor: AccountsPlatformUser) {
    return this.prisma.accountsDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { _count: { select: { user_roles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRole(actor: AccountsPlatformUser, roleId: number) {
    const role = await this.prisma.accountsDynamicRole.findFirst({
      where: { role_id: roleId, institute_id: actor.institute_id },
      include: { user_roles: true },
    });
    if (!role) throw new NotFoundException(`Role #${roleId} not found`);
    return role;
  }

  async updateRole(actor: AccountsPlatformUser, roleId: number, dto: UpdateAccountsDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.accountsDynamicRole.update({
      where: { role_id: roleId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.permissions && { permissions: dto.permissions as unknown as Prisma.InputJsonValue }),
      },
    });
  }

  async deleteRole(actor: AccountsPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.accountsDynamicRole.delete({ where: { role_id: roleId } });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(actor: AccountsPlatformUser, dto: AssignAccountsUserToRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.accountsUserDynamicRole.findUnique({
      where: { institute_id_eddva_user_id: { institute_id: actor.institute_id, eddva_user_id: dto.eddva_user_id } },
    });

    if (existing) {
      const updated = await this.prisma.accountsUserDynamicRole.update({
        where: { id: existing.id },
        data: {
          role_id: dto.role_id,
          username: dto.username,
          password_hash,
          user_name: dto.user_name,
          user_email: dto.user_email,
        },
        include: { role: true },
      });
      const { password_hash: _, ...safe } = updated;
      return safe;
    }

    const created = await this.prisma.accountsUserDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        eddva_user_id: dto.eddva_user_id,
        user_name: dto.user_name,
        user_email: dto.user_email,
        username: dto.username,
        password_hash,
        role_id: dto.role_id,
      },
      include: { role: true },
    });
    const { password_hash: _, ...safe } = created;
    return safe;
  }

  async resetUserPassword(actor: AccountsPlatformUser, assignmentId: number, newPassword: string) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.accountsUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.accountsUserDynamicRole.update({ where: { id: assignmentId }, data: { password_hash } });
    return { success: true, message: `Password reset successfully for user "${assignment.username}"` };
  }

  async listUserAssignments(actor: AccountsPlatformUser) {
    const list = await this.prisma.accountsUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map(({ password_hash, ...safe }) => safe);
  }

  async revokeUser(actor: AccountsPlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.accountsUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);
    return this.prisma.accountsUserDynamicRole.delete({ where: { id: assignmentId } });
  }

  /** Returns permission matrix held by current user */
  async getMyPermissions(actor: AccountsPlatformUser): Promise<any> {
    if (isAccountsAdmin(actor)) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({ resource: res.resource, actions: [...res.available_actions] }));
    }
    // Resolved by the same code the permissions guard uses (role_id claim,
    // then the user's assignment, then JWT permissions). This method used to
    // look up only the assignment, so for a token carrying role_id it could
    // report a different matrix from the one actually being enforced.
    const { rules } = await this.access.getPermissionRules(actor);
    return rules;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireInstituteAdmin(actor: AccountsPlatformUser) {
    if (!isAccountsAdmin(actor)) {
      throw new ForbiddenException('Only Institute Admin can manage Accounts roles and permissions');
    }
  }
}
