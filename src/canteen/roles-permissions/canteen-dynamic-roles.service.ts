import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCanteenDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateCanteenDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignCanteenUserToRoleDto } from './dto/assign-user.dto';
import { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { CanteenPermissionsRegistryService } from './canteen-permissions-registry.service';
import { isCanteenAdmin } from '../common/canteen-access.service';

@Injectable()
export class CanteenDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: CanteenPermissionsRegistryService,
  ) {}

  /** Returns the dynamic resource & action catalog definitions fetched live from PostgreSQL DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(
    actor: CanteenPlatformUser,
    dto: CreateCanteenDynamicRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    const existing = await this.prisma.canteenDynamicRole.findUnique({
      where: {
        institute_id_name: { institute_id: actor.institute_id, name: dto.name },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A role named "${dto.name}" already exists for this institute`,
      );
    }
    return this.prisma.canteenDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions:
          (dto.permissions as unknown as Prisma.InputJsonValue) ?? [],
      },
    });
  }

  async listRoles(actor: CanteenPlatformUser) {
    this.requireInstituteAdmin(actor);
    return this.prisma.canteenDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { _count: { select: { user_roles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * `user_roles` is selected field-by-field rather than `include: true` so
   * password_hash — a bcrypt hash, but still not something a role lookup
   * should ever return — can never leak through this endpoint, regardless
   * of who else touches this query later.
   */
  async getRole(actor: CanteenPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    const role = await this.prisma.canteenDynamicRole.findFirst({
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
    actor: CanteenPlatformUser,
    roleId: number,
    dto: UpdateCanteenDynamicRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.canteenDynamicRole.update({
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

  async deleteRole(actor: CanteenPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.canteenDynamicRole.delete({
      where: { role_id: roleId },
    });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(
    actor: CanteenPlatformUser,
    dto: AssignCanteenUserToRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    // The (institute_id, username) unique index is separate from the
    // (institute_id, eddva_user_id) one used for upsert below, so a username
    // already held by a *different* user must be rejected explicitly instead
    // of surfacing as a raw Prisma unique-constraint 500.
    const usernameOwner = await this.prisma.canteenUserDynamicRole.findUnique({
      where: {
        institute_id_username: {
          institute_id: actor.institute_id,
          username: dto.username,
        },
      },
    });
    if (usernameOwner && usernameOwner.eddva_user_id !== dto.eddva_user_id) {
      throw new ConflictException(
        `Username "${dto.username}" is already taken in this institute`,
      );
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.canteenUserDynamicRole.findUnique({
      where: {
        institute_id_eddva_user_id: {
          institute_id: actor.institute_id,
          eddva_user_id: dto.eddva_user_id,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.canteenUserDynamicRole.update({
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

    const created = await this.prisma.canteenUserDynamicRole.create({
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

  async resetUserPassword(
    actor: CanteenPlatformUser,
    assignmentId: number,
    newPassword: string,
  ) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.canteenUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment)
      throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.canteenUserDynamicRole.update({
      where: { id: assignmentId },
      data: { password_hash },
    });
    return {
      success: true,
      message: `Password reset successfully for user "${assignment.username}"`,
    };
  }

  async listUserAssignments(actor: CanteenPlatformUser) {
    this.requireInstituteAdmin(actor);
    const list = await this.prisma.canteenUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map(({ password_hash, ...safe }) => safe);
  }

  async revokeUser(actor: CanteenPlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.canteenUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment)
      throw new NotFoundException(`Assignment #${assignmentId} not found`);
    const deleted = await this.prisma.canteenUserDynamicRole.delete({
      where: { id: assignmentId },
    });
    const { password_hash: _, ...safe } = deleted;
    return safe;
  }

  /** Returns permission matrix held by current user */
  async getMyPermissions(actor: CanteenPlatformUser): Promise<any> {
    if (isCanteenAdmin(actor)) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({
        resource: res.resource,
        actions: [...res.available_actions],
      }));
    }
    const assignment = await this.prisma.canteenUserDynamicRole.findFirst({
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

  private requireInstituteAdmin(actor: CanteenPlatformUser) {
    if (!isCanteenAdmin(actor)) {
      throw new ForbiddenException(
        'Only Institute Admin can manage Canteen roles and permissions',
      );
    }
  }
}
