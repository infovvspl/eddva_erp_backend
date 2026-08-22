import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSportsDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateSportsDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignSportsUserToRoleDto } from './dto/assign-user.dto';
import { SportsPlatformUser } from '../auth/sports-auth.service';
import { SportsPermissionsRegistryService } from './sports-permissions-registry.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SportsDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: SportsPermissionsRegistryService,
  ) {}

  /** Returns the dynamic resource & action catalog definitions fetched live from PostgreSQL DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(actor: SportsPlatformUser, dto: CreateSportsDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    const existing = await this.prisma.sportsDynamicRole.findUnique({
      where: { institute_id_name: { institute_id: actor.institute_id, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists for this institute`);
    }
    return this.prisma.sportsDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions: (dto.permissions as unknown as Prisma.InputJsonValue) ?? [],
      },
    });
  }

  async listRoles(actor: SportsPlatformUser) {
    return this.prisma.sportsDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { _count: { select: { user_roles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRole(actor: SportsPlatformUser, roleId: number) {
    const role = await this.prisma.sportsDynamicRole.findFirst({
      where: { role_id: roleId, institute_id: actor.institute_id },
      include: { user_roles: true },
    });
    if (!role) throw new NotFoundException(`Role #${roleId} not found`);
    return role;
  }

  async updateRole(actor: SportsPlatformUser, roleId: number, dto: UpdateSportsDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.sportsDynamicRole.update({
      where: { role_id: roleId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.permissions && { permissions: dto.permissions as unknown as Prisma.InputJsonValue }),
      },
    });
  }

  async deleteRole(actor: SportsPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.sportsDynamicRole.delete({ where: { role_id: roleId } });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(actor: SportsPlatformUser, dto: AssignSportsUserToRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.sportsUserDynamicRole.findUnique({
      where: {
        institute_id_eddva_user_id: {
          institute_id: actor.institute_id,
          eddva_user_id: dto.eddva_user_id,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.sportsUserDynamicRole.update({
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

    const created = await this.prisma.sportsUserDynamicRole.create({
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

  async resetUserPassword(actor: SportsPlatformUser, assignmentId: number, newPassword: string) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.sportsUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.sportsUserDynamicRole.update({
      where: { id: assignmentId },
      data: { password_hash },
    });
    return { success: true, message: `Password reset successfully for user "${assignment.username}"` };
  }

  async listUserAssignments(actor: SportsPlatformUser) {
    const list = await this.prisma.sportsUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map(({ password_hash, ...safe }) => safe);
  }

  async revokeUser(actor: SportsPlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.sportsUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);
    return this.prisma.sportsUserDynamicRole.delete({ where: { id: assignmentId } });
  }

  /** Returns permission matrix held by current user */
  async getMyPermissions(actor: SportsPlatformUser): Promise<any> {
    if (actor.is_institute_admin) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({
        resource: res.resource,
        actions: [...res.available_actions],
      }));
    }
    const assignment = await this.prisma.sportsUserDynamicRole.findUnique({
      where: {
        institute_id_eddva_user_id: {
          institute_id: actor.institute_id,
          eddva_user_id: actor.eddva_user_id,
        },
      },
      include: { role: true },
    });
    return assignment?.role.permissions ?? [];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireInstituteAdmin(actor: SportsPlatformUser) {
    if (!actor.is_institute_admin) {
      throw new ForbiddenException('Only Institute Admin can manage sports roles and permissions');
    }
  }
}
