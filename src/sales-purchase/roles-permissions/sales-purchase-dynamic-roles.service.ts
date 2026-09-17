import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesPurchaseDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateSalesPurchaseDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignSalesPurchaseUserToRoleDto } from './dto/assign-user.dto';
import { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';
import { SalesPurchasePermissionsRegistryService } from './sales-purchase-permissions-registry.service';
import { isSpAdmin } from '../common/sales-purchase-access.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SalesPurchaseDynamicRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: SalesPurchasePermissionsRegistryService,
  ) {}

  /** Returns the dynamic resource & action catalog definitions fetched live from PostgreSQL DB */
  async getPermissionCatalog() {
    return this.permissionsService.listPermissions();
  }

  // ─── Roles CRUD ───────────────────────────────────────────────────────────

  async createRole(
    actor: SalesPurchasePlatformUser,
    dto: CreateSalesPurchaseDynamicRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    const existing = await this.prisma.salesPurchaseDynamicRole.findUnique({
      where: {
        institute_id_name: { institute_id: actor.institute_id, name: dto.name },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A role named "${dto.name}" already exists for this institute`,
      );
    }
    return this.prisma.salesPurchaseDynamicRole.create({
      data: {
        institute_id: actor.institute_id,
        name: dto.name,
        description: dto.description,
        permissions:
          (dto.permissions as unknown as Prisma.InputJsonValue) ?? [],
      },
    });
  }

  async listRoles(actor: SalesPurchasePlatformUser) {
    this.requireInstituteAdmin(actor);
    return this.prisma.salesPurchaseDynamicRole.findMany({
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
  async getRole(actor: SalesPurchasePlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    const role = await this.prisma.salesPurchaseDynamicRole.findFirst({
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
    actor: SalesPurchasePlatformUser,
    roleId: number,
    dto: UpdateSalesPurchaseDynamicRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.salesPurchaseDynamicRole.update({
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

  async deleteRole(actor: SalesPurchasePlatformUser, roleId: number) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, roleId);
    return this.prisma.salesPurchaseDynamicRole.delete({
      where: { role_id: roleId },
    });
  }

  // ─── User Assignment & Credentials Management ──────────────────────────────

  async assignUser(
    actor: SalesPurchasePlatformUser,
    dto: AssignSalesPurchaseUserToRoleDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getRole(actor, dto.role_id);

    const password_hash = await bcrypt.hash(dto.password, 10);

    const existing = await this.prisma.salesPurchaseUserDynamicRole.findUnique({
      where: {
        institute_id_eddva_user_id: {
          institute_id: actor.institute_id,
          eddva_user_id: dto.eddva_user_id,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.salesPurchaseUserDynamicRole.update({
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

    const created = await this.prisma.salesPurchaseUserDynamicRole.create({
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
    actor: SalesPurchasePlatformUser,
    assignmentId: number,
    newPassword: string,
  ) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.salesPurchaseUserDynamicRole.findFirst(
      {
        where: { id: assignmentId, institute_id: actor.institute_id },
      },
    );
    if (!assignment)
      throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.salesPurchaseUserDynamicRole.update({
      where: { id: assignmentId },
      data: { password_hash },
    });
    return {
      success: true,
      message: `Password reset successfully for user "${assignment.username}"`,
    };
  }

  async listUserAssignments(actor: SalesPurchasePlatformUser) {
    this.requireInstituteAdmin(actor);
    const list = await this.prisma.salesPurchaseUserDynamicRole.findMany({
      where: { institute_id: actor.institute_id },
      include: { role: true },
      orderBy: { assigned_at: 'desc' },
    });
    return list.map(({ password_hash, ...safe }) => safe);
  }

  async revokeUser(actor: SalesPurchasePlatformUser, assignmentId: number) {
    this.requireInstituteAdmin(actor);
    const assignment = await this.prisma.salesPurchaseUserDynamicRole.findFirst(
      {
        where: { id: assignmentId, institute_id: actor.institute_id },
      },
    );
    if (!assignment)
      throw new NotFoundException(`Assignment #${assignmentId} not found`);
    return this.prisma.salesPurchaseUserDynamicRole.delete({
      where: { id: assignmentId },
    });
  }

  /** Returns permission matrix held by current user */
  async getMyPermissions(actor: SalesPurchasePlatformUser): Promise<any> {
    if (isSpAdmin(actor)) {
      const catalog = await this.permissionsService.listPermissions();
      return catalog.resources.map((res) => ({
        resource: res.resource,
        actions: [...res.available_actions],
      }));
    }
    const assignment =
      await this.prisma.salesPurchaseUserDynamicRole.findUnique({
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

  private requireInstituteAdmin(actor: SalesPurchasePlatformUser) {
    if (!isSpAdmin(actor)) {
      throw new ForbiddenException(
        'Only Institute Admin can manage Sales & Purchase roles and permissions',
      );
    }
  }
}
