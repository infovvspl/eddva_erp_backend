import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateInventoryDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignInventoryUserToRoleDto } from './dto/assign-user.dto';
import { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { InventoryPermissionsRegistryService } from './inventory-permissions-registry.service';
import { isInvAdmin } from '../common/inventory-access.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: InventoryPermissionsRegistryService,
  ) {}

  /** Returns the dynamic resource & action catalog definitions fetched live from PostgreSQL DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(actor: InventoryPlatformUser, dto: CreateInventoryDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    const existing = await this.prisma.inventoryDynamicRole.findUnique({
      where: { institute_id_name: { institute_id: actor.institute_id, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists for this institute`);
    }
    return this.prisma.inventoryDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions: (dto.permissions as unknown as Prisma.InputJsonValue) ?? [],
      },
    });
  }

  async listRoles(actor: InventoryPlatformUser) {
    return this.prisma.inventoryDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { _count: { select: { user_roles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRole(actor: InventoryPlatformUser, roleId: number) {
    const role = await this.prisma.inventoryDynamicRole.findFirst({
      where: { role_id: roleId, institute_id: actor.institute_id },
      include: { user_roles: true },
    });
    if (!role) throw new NotFoundException(`Role #${roleId} not found`);
    return role;
  }

  async updateRole(actor: InventoryPlatformUser, roleId: number, dto: UpdateInventoryDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.inventoryDynamicRole.update({
      where: { role_id: roleId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.permissions && { permissions: dto.permissions as unknown as Prisma.InputJsonValue }),
      },
    });
  }

  async deleteRole(actor: InventoryPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.inventoryDynamicRole.delete({ where: { role_id: roleId } });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(actor: InventoryPlatformUser, dto: AssignInventoryUserToRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.inventoryUserDynamicRole.findUnique({
      where: { institute_id_eddva_user_id: { institute_id: actor.institute_id, eddva_user_id: dto.eddva_user_id } },
    });

    if (existing) {
      const updated = await this.prisma.inventoryUserDynamicRole.update({
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

    const created = await this.prisma.inventoryUserDynamicRole.create({
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

  async resetUserPassword(actor: InventoryPlatformUser, assignmentId: number, newPassword: string) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.inventoryUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.inventoryUserDynamicRole.update({ where: { id: assignmentId }, data: { password_hash } });
    return { success: true, message: `Password reset successfully for user "${assignment.username}"` };
  }

  async listUserAssignments(actor: InventoryPlatformUser) {
    const list = await this.prisma.inventoryUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map(({ password_hash, ...safe }) => safe);
  }

  async revokeUser(actor: InventoryPlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.inventoryUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);
    return this.prisma.inventoryUserDynamicRole.delete({ where: { id: assignmentId } });
  }

  /** Returns permission matrix held by current user */
  async getMyPermissions(actor: InventoryPlatformUser): Promise<any> {
    if (isInvAdmin(actor)) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({ resource: res.resource, actions: [...res.available_actions] }));
    }
    const assignment = await this.prisma.inventoryUserDynamicRole.findUnique({
      where: { institute_id_eddva_user_id: { institute_id: actor.institute_id, eddva_user_id: actor.eddva_user_id } },
      include: { role: true },
    });
    return assignment?.role.permissions ?? [];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireInstituteAdmin(actor: InventoryPlatformUser) {
    if (!isInvAdmin(actor)) {
      throw new ForbiddenException('Only Institute Admin can manage Inventory roles and permissions');
    }
  }
}
