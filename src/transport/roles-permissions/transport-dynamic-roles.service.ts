import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransportDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateTransportDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignTransportUserToRoleDto } from './dto/assign-user.dto';
import { TransportPlatformUser } from '../auth/transport-auth.service';
import { TransportPermissionsRegistryService } from './transport-permissions-registry.service';
import { isTransportAdmin } from '../common/transport-access.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TransportDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: TransportPermissionsRegistryService,
  ) {}

  /** Returns the dynamic resource & action catalog definitions fetched live from PostgreSQL DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(actor: TransportPlatformUser, dto: CreateTransportDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    const existing = await this.prisma.transportDynamicRole.findUnique({
      where: { institute_id_name: { institute_id: actor.institute_id, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists for this institute`);
    }
    return this.prisma.transportDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions: (dto.permissions as unknown as Prisma.InputJsonValue) ?? [],
      },
    });
  }

  async listRoles(actor: TransportPlatformUser) {
    return this.prisma.transportDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { _count: { select: { user_roles: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRole(actor: TransportPlatformUser, roleId: number) {
    const role = await this.prisma.transportDynamicRole.findFirst({
      where: { role_id: roleId, institute_id: actor.institute_id },
      include: { user_roles: true },
    });
    if (!role) throw new NotFoundException(`Role #${roleId} not found`);
    return role;
  }

  async updateRole(actor: TransportPlatformUser, roleId: number, dto: UpdateTransportDynamicRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.transportDynamicRole.update({
      where: { role_id: roleId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.permissions && { permissions: dto.permissions as unknown as Prisma.InputJsonValue }),
      },
    });
  }

  async deleteRole(actor: TransportPlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.transportDynamicRole.delete({ where: { role_id: roleId } });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(actor: TransportPlatformUser, dto: AssignTransportUserToRoleDto) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.transportUserDynamicRole.findUnique({
      where: { institute_id_eddva_user_id: { institute_id: actor.institute_id, eddva_user_id: dto.eddva_user_id } },
    });

    if (existing) {
      const updated = await this.prisma.transportUserDynamicRole.update({
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

    const created = await this.prisma.transportUserDynamicRole.create({
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

  async resetUserPassword(actor: TransportPlatformUser, assignmentId: number, newPassword: string) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.transportUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.transportUserDynamicRole.update({ where: { id: assignmentId }, data: { password_hash } });
    return { success: true, message: `Password reset successfully for user "${assignment.username}"` };
  }

  async listUserAssignments(actor: TransportPlatformUser) {
    const list = await this.prisma.transportUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map(({ password_hash, ...safe }) => safe);
  }

  async revokeUser(actor: TransportPlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.transportUserDynamicRole.findFirst({
      where: { id: assignmentId, institute_id: actor.institute_id },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);
    return this.prisma.transportUserDynamicRole.delete({ where: { id: assignmentId } });
  }

  /** Returns permission matrix held by current user */
  async getMyPermissions(actor: TransportPlatformUser): Promise<any> {
    if (isTransportAdmin(actor)) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({ resource: res.resource, actions: [...res.available_actions] }));
    }
    const assignment = await this.prisma.transportUserDynamicRole.findUnique({
      where: { institute_id_eddva_user_id: { institute_id: actor.institute_id, eddva_user_id: actor.eddva_user_id } },
      include: { role: true },
    });
    return assignment?.role.permissions ?? [];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private requireInstituteAdmin(actor: TransportPlatformUser) {
    if (!isTransportAdmin(actor)) {
      throw new ForbiddenException('Only Institute Admin can manage Transport roles and permissions');
    }
  }
}
