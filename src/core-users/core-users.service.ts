import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireInstituteId } from '../common/utils/require-institute.util';

// Role names auth.service.ts's buildAuthResponse() already treats as full
// access (it grants every system permission whenever a user's role name
// matches one of these, regardless of what's actually in role_permissions).
// Reusing 'INSTITUTE_ADMIN' here — rather than inventing a new name — means a
// user promoted from this page gets full access immediately, the same way an
// SSO-provisioned institute admin does.
const ADMIN_ROLE_NAME = 'INSTITUTE_ADMIN';
const DEFAULT_NON_ADMIN_ROLE_NAME = 'STAFF';

const ADMIN_ROLE_NAMES_UPPER = ['INSTITUTE ADMINISTRATOR', 'SUPER_ADMIN', 'INSTITUTE_ADMIN'];

function isAdminRoleName(roleName: string): boolean {
  return ADMIN_ROLE_NAMES_UPPER.includes((roleName || '').toUpperCase());
}

@Injectable()
export class CoreUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: { instituteId?: string | null }) {
    const instituteId = requireInstituteId(requester.instituteId);

    const users = await this.prisma.user.findMany({
      where: { instituteId },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      roleId: u.roleId,
      roleName: u.role.roleName,
      isAdmin: isAdminRoleName(u.role.roleName),
      createdAt: u.createdAt,
    }));
  }

  private async findOrCreateRole(instituteId: string, roleName: string) {
    const existing = await this.prisma.role.findUnique({
      where: { roleName_instituteId: { roleName, instituteId } },
    });
    if (existing) return existing;
    return this.prisma.role.create({
      data: { instituteId, roleName, status: 'ACTIVE' },
    });
  }

  /**
   * Grants or revokes full admin access for an existing ERP user in the
   * requester's own institute. Only someone who already has
   * institute_admin.users.manage may call this (checked by the controller).
   */
  async setAdminRole(
    requester: { id: string; instituteId?: string | null },
    targetUserId: string,
    isAdmin: boolean,
  ) {
    const instituteId = requireInstituteId(requester.instituteId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.instituteId !== instituteId) {
      throw new ForbiddenException('You can only manage users in your own institute');
    }

    if (!isAdmin) {
      if (target.id === requester.id) {
        throw new BadRequestException('You cannot revoke your own admin access');
      }
      if (isAdminRoleName(target.role.roleName)) {
        const others = await this.prisma.user.findMany({
          where: { instituteId, id: { not: target.id } },
          include: { role: true },
        });
        const remainingAdmins = others.filter((u) => isAdminRoleName(u.role.roleName)).length;
        if (remainingAdmins === 0) {
          throw new BadRequestException('An institute must always have at least one admin');
        }
      }
    }

    const role = await this.findOrCreateRole(
      instituteId,
      isAdmin ? ADMIN_ROLE_NAME : DEFAULT_NON_ADMIN_ROLE_NAME,
    );

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { roleId: role.id },
      include: { role: true },
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      roleId: updated.roleId,
      roleName: updated.role.roleName,
      isAdmin: isAdminRoleName(updated.role.roleName),
    };
  }
}
