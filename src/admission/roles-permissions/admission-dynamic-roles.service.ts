import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdmissionDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateAdmissionDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignAdmissionUserToRoleDto } from './dto/assign-user.dto';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionPermissionsRegistryService } from './admission-permissions-registry.service';
import { isAdmissionAdmin } from '../common/admission-access.service';

/** Login assignments must never be returned with their bcrypt hash. */
function withoutPasswordHash<T extends { password_hash: string }>(
  row: T,
): Omit<T, 'password_hash'> {
  const safe: Partial<T> = { ...row };
  delete safe.password_hash;
  return safe as Omit<T, 'password_hash'>;
}

interface RuleInput {
  resource: string;
  actions: string[];
}

@Injectable()
export class AdmissionDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: AdmissionPermissionsRegistryService,
  ) {}

  /** Returns the resource & action catalog fetched live from the DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  /**
   * Rejects rules that reference a resource/action that is not an active entry
   * in the catalog — a typo would otherwise silently grant nothing.
   */
  private async assertRulesInCatalog(rules: RuleInput[]) {
    const active = await this.prisma.admissionPermission.findMany({
      where: { is_active: true },
      select: { resource: true, action: true },
    });
    const known = new Set(active.map((p) => `${p.resource}:${p.action}`));
    const unknown = rules.flatMap((rule) =>
      rule.actions
        .filter((action) => !known.has(`${rule.resource}:${action}`))
        .map((action) => `${rule.resource}:${action}`),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive permissions: ${unknown.join(', ')}`,
      );
    }
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(
    actor: AdmissionPlatformUser,
    dto: CreateAdmissionDynamicRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.assertRulesInCatalog(dto.permissions);
    const existing = await this.prisma.admissionDynamicRole.findUnique({
      where: {
        institute_id_name: { institute_id: actor.institute_id, name: dto.name },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A role named "${dto.name}" already exists for this institute`,
      );
    }
    return this.prisma.admissionDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listRoles(actor: AdmissionPlatformUser) {
    this.requireInstituteAdmin(actor);
    return this.prisma.admissionDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { _count: { select: { user_roles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * `user_roles` is selected field-by-field rather than `include: true` so
   * password_hash can never leak through this endpoint.
   */
  async getRole(actor: AdmissionPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    const role = await this.prisma.admissionDynamicRole.findFirst({
      where: { role_id: roleId, institute_id: actor.institute_id },
      include: {
        user_roles: {
          select: {
            id: true,
            institute_id: true,
            eddva_user_id: true,
            user_name: true,
            user_email: true,
            username: true,
            is_active: true,
            role_id: true,
            assigned_at: true,
          },
        },
      },
    });
    if (!role) throw new NotFoundException(`Role #${roleId} not found`);
    return role;
  }

  async updateRole(
    actor: AdmissionPlatformUser,
    roleId: number,
    dto: UpdateAdmissionDynamicRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    const role = await this.getRole(actor, roleId);
    if (dto.permissions) await this.assertRulesInCatalog(dto.permissions);
    if (dto.name && dto.name !== role.name) {
      const clash = await this.prisma.admissionDynamicRole.findUnique({
        where: {
          institute_id_name: {
            institute_id: actor.institute_id,
            name: dto.name,
          },
        },
      });
      if (clash) {
        throw new ConflictException(
          `A role named "${dto.name}" already exists for this institute`,
        );
      }
    }
    return this.prisma.admissionDynamicRole.update({
      where: { role_id: roleId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.permissions && {
          permissions: dto.permissions as unknown as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async deleteRole(actor: AdmissionPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    const role = await this.getRole(actor, roleId);
    // The role→assignment FK cascades: deleting a role that still has users
    // would silently erase their logins. Make that an explicit decision.
    if (role.user_roles.length > 0) {
      throw new ConflictException(
        `Role "${role.name}" still has ${role.user_roles.length} assigned user(s). Revoke or re-assign them before deleting the role.`,
      );
    }
    return this.prisma.admissionDynamicRole.delete({
      where: { role_id: roleId },
    });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(
    actor: AdmissionPlatformUser,
    dto: AssignAdmissionUserToRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    // The (institute_id, username) unique index is separate from the
    // (institute_id, eddva_user_id) one used for the upsert below, so a
    // username already held by a *different* user must be rejected explicitly
    // instead of surfacing as a raw Prisma unique-constraint 500.
    const usernameOwner = await this.prisma.admissionUserDynamicRole.findUnique(
      {
        where: {
          institute_id_username: {
            institute_id: actor.institute_id,
            username: dto.username,
          },
        },
      },
    );
    if (usernameOwner && usernameOwner.eddva_user_id !== dto.eddva_user_id) {
      throw new ConflictException(
        `Username "${dto.username}" is already taken in this institute`,
      );
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.admissionUserDynamicRole.findUnique({
      where: {
        institute_id_eddva_user_id: {
          institute_id: actor.institute_id,
          eddva_user_id: dto.eddva_user_id,
        },
      },
    });

    const saved = existing
      ? await this.prisma.admissionUserDynamicRole.update({
          where: { id: existing.id },
          data: {
            role_id: dto.role_id,
            username: dto.username,
            password_hash,
            user_name: dto.user_name,
            user_email: dto.user_email,
            is_active: true,
          },
          include: { role: true },
        })
      : await this.prisma.admissionUserDynamicRole.create({
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
    return withoutPasswordHash(saved);
  }

  async resetUserPassword(
    actor: AdmissionPlatformUser,
    assignmentId: number,
    newPassword: string,
  ) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.admissionUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment)
      throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.admissionUserDynamicRole.update({
      where: { id: assignmentId },
      data: { password_hash },
    });
    return {
      success: true,
      message: `Password reset successfully for user "${assignment.username}"`,
    };
  }

  async listUserAssignments(actor: AdmissionPlatformUser) {
    this.requireInstituteAdmin(actor);
    const list = await this.prisma.admissionUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map((row) => withoutPasswordHash(row));
  }

  async revokeUser(actor: AdmissionPlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.admissionUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment)
      throw new NotFoundException(`Assignment #${assignmentId} not found`);
    const deleted = await this.prisma.admissionUserDynamicRole.delete({
      where: { id: assignmentId },
    });
    return withoutPasswordHash(deleted);
  }

  /** Returns the permission matrix held by the current user */
  async getMyPermissions(actor: AdmissionPlatformUser) {
    if (isAdmissionAdmin(actor)) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({
        resource: res.resource,
        actions: [...res.available_actions],
      }));
    }
    const assignment = await this.prisma.admissionUserDynamicRole.findFirst({
      where: {
        institute_id: actor.institute_id,
        eddva_user_id: actor.eddva_user_id,
        is_active: true,
      },
      include: { role: true },
    });
    return assignment?.role.permissions ?? [];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireInstituteAdmin(actor: AdmissionPlatformUser) {
    if (!isAdmissionAdmin(actor)) {
      throw new ForbiddenException(
        'Only Institute Admin can manage Admission roles and permissions',
      );
    }
  }
}
