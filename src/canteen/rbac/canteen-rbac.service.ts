import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import * as bcrypt from 'bcrypt';
import { CreateCanteenRoleDto } from './dto/create-canteen-role.dto';
import { UpdateCanteenRoleDto } from './dto/update-canteen-role.dto';
import { AssignCanteenPermissionsDto } from './dto/assign-canteen-permissions.dto';
import { CreateCanteenPermissionDto } from './dto/create-canteen-permission.dto';
import { UpdateCanteenPermissionDto } from './dto/update-canteen-permission.dto';
import { AssignUserCanteenRoleDto } from './dto/assign-user-canteen-role.dto';
import { CreateCanteenUserDto } from './dto/create-canteen-user.dto';
import { UpdateCanteenUserDto } from './dto/update-canteen-user.dto';

@Injectable()
export class CanteenRbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // --- Roles ---
  async getRoles() {
    return this.prisma.canteenRole.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        userRoles: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getRoleById(id: string) {
    const role = await this.prisma.canteenRole.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        userRoles: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });
    if (!role) {
      throw new NotFoundException('Canteen role not found.');
    }
    return role;
  }

  async createRole(dto: CreateCanteenRoleDto, actorUserId?: string) {
    const existing = await this.prisma.canteenRole.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Canteen role with name '${dto.name}' already exists.`);
    }

    if (dto.permissionIds && dto.permissionIds.length > 0) {
      const perms = await this.prisma.canteenPermission.findMany({
        where: { id: { in: dto.permissionIds } },
      });
      if (perms.length !== dto.permissionIds.length) {
        throw new BadRequestException('One or more invalid Canteen permission IDs.');
      }
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const newRole = await tx.canteenRole.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          isSystem: false,
        },
      });

      if (dto.permissionIds && dto.permissionIds.length > 0) {
        await tx.canteenRolePermission.createMany({
          data: dto.permissionIds.map((pId) => ({
            roleId: newRole.id,
            permissionId: pId,
          })),
        });
      }

      return tx.canteenRole.findUnique({
        where: { id: newRole.id },
        include: {
          rolePermissions: { include: { permission: true } },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenRole',
      entityId: role!.id,
      action: 'Canteen Role Created',
      metadata: { roleName: role!.name },
    });

    return role;
  }

  async updateRole(id: string, dto: UpdateCanteenRoleDto, actorUserId?: string) {
    const role = await this.prisma.canteenRole.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Canteen role not found.');
    }

    if (dto.name && dto.name !== role.name) {
      const existing = await this.prisma.canteenRole.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`Role with name '${dto.name}' already exists.`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.canteenRole.update({
        where: { id },
        data: {
          name: dto.name ?? role.name,
          description: dto.description !== undefined ? dto.description : role.description,
        },
      });

      if (dto.permissionIds !== undefined) {
        await tx.canteenRolePermission.deleteMany({ where: { roleId: id } });
        if (dto.permissionIds.length > 0) {
          const perms = await tx.canteenPermission.findMany({
            where: { id: { in: dto.permissionIds } },
          });
          if (perms.length !== dto.permissionIds.length) {
            throw new BadRequestException('One or more invalid Canteen permission IDs.');
          }

          await tx.canteenRolePermission.createMany({
            data: dto.permissionIds.map((pId) => ({
              roleId: id,
              permissionId: pId,
            })),
          });
        }
      }

      return tx.canteenRole.findUnique({
        where: { id },
        include: {
          rolePermissions: { include: { permission: true } },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenRole',
      entityId: id,
      action: 'Canteen Role Updated',
      metadata: { roleName: updated!.name },
    });

    return updated;
  }

  async deleteRole(id: string, actorUserId?: string) {
    const role = await this.prisma.canteenRole.findUnique({
      where: { id },
      include: { userRoles: true },
    });
    if (!role) {
      throw new NotFoundException('Canteen role not found.');
    }

    if (role.isSystem) {
      throw new ForbiddenException('Default system Canteen roles cannot be deleted.');
    }

    if (role.userRoles.length > 0) {
      throw new BadRequestException(
        `Cannot delete role '${role.name}' because it is currently assigned to ${role.userRoles.length} user(s).`,
      );
    }

    await this.prisma.canteenRolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.canteenRole.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenRole',
      entityId: id,
      action: 'Canteen Role Deleted',
      metadata: { roleName: role.name },
    });

    return { message: `Canteen role '${role.name}' deleted successfully.` };
  }

  // --- Role Permissions ---
  async getRolePermissions(roleId: string) {
    await this.getRoleById(roleId);
    return this.prisma.canteenRolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
  }

  async assignRolePermissions(roleId: string, dto: AssignCanteenPermissionsDto, actorUserId?: string) {
    const role = await this.getRoleById(roleId);

    // Validate supplied permissions belong to Canteen module
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      const perms = await this.prisma.canteenPermission.findMany({
        where: { id: { in: dto.permissionIds } },
      });
      if (perms.length !== dto.permissionIds.length) {
        throw new BadRequestException('One or more invalid Canteen permission IDs provided.');
      }
      for (const p of perms) {
        if (p.module !== 'canteen' && !p.key.startsWith('canteen.')) {
          throw new BadRequestException(`Permission '${p.key}' does not belong to Canteen module.`);
        }
      }
    }

    await this.prisma.canteenRolePermission.deleteMany({ where: { roleId } });
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.prisma.canteenRolePermission.createMany({
        data: dto.permissionIds.map((pId) => ({
          roleId,
          permissionId: pId,
        })),
      });
    }

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenRole',
      entityId: roleId,
      action: 'Canteen Role Permissions Assigned',
      metadata: { roleName: role.name, permissionCount: dto.permissionIds.length },
    });

    return this.getRoleById(roleId);
  }

  async addPermissionToRole(roleId: string, permissionIdOrKey: string, actorUserId?: string) {
    const role = await this.getRoleById(roleId);

    const perm = await this.prisma.canteenPermission.findFirst({
      where: {
        OR: [
          { id: permissionIdOrKey },
          { key: permissionIdOrKey },
        ],
      },
    });

    if (!perm) {
      throw new NotFoundException('Canteen permission not found.');
    }

    const existingLink = await this.prisma.canteenRolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId: perm.id,
        },
      },
    });

    if (!existingLink) {
      await this.prisma.canteenRolePermission.create({
        data: {
          roleId,
          permissionId: perm.id,
        },
      });
    }

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenRole',
      entityId: roleId,
      action: 'Permission Added to Canteen Role',
      metadata: { roleName: role.name, permissionKey: perm.key },
    });

    return this.getRoleById(roleId);
  }

  async removePermissionFromRole(roleId: string, permissionIdOrKey: string, actorUserId?: string) {
    const role = await this.getRoleById(roleId);

    const perm = await this.prisma.canteenPermission.findFirst({
      where: {
        OR: [
          { id: permissionIdOrKey },
          { key: permissionIdOrKey },
        ],
      },
    });

    if (!perm) {
      throw new NotFoundException('Canteen permission not found.');
    }

    await this.prisma.canteenRolePermission.deleteMany({
      where: {
        roleId,
        permissionId: perm.id,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenRole',
      entityId: roleId,
      action: 'Permission Removed from Canteen Role',
      metadata: { roleName: role.name, permissionKey: perm.key },
    });

    return this.getRoleById(roleId);
  }

  // --- Permissions ---
  async getPermissions() {
    return this.prisma.canteenPermission.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async getPermissionById(id: string) {
    const permission = await this.prisma.canteenPermission.findUnique({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException('Canteen permission not found.');
    }
    return permission;
  }

  async createPermission(dto: CreateCanteenPermissionDto, actorUserId?: string) {
    const existing = await this.prisma.canteenPermission.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(`Canteen permission key '${dto.key}' already exists.`);
    }

    const permission = await this.prisma.canteenPermission.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description || null,
        module: 'canteen',
        isSystem: false,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenPermission',
      entityId: permission.id,
      action: 'Canteen Permission Created',
      metadata: { key: permission.key },
    });

    return permission;
  }

  async updatePermission(id: string, dto: UpdateCanteenPermissionDto, actorUserId?: string) {
    const permission = await this.getPermissionById(id);

    const updated = await this.prisma.canteenPermission.update({
      where: { id },
      data: {
        name: dto.name ?? permission.name,
        description: dto.description !== undefined ? dto.description : permission.description,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenPermission',
      entityId: id,
      action: 'Canteen Permission Updated',
      metadata: { key: permission.key },
    });

    return updated;
  }

  async deletePermission(id: string, actorUserId?: string) {
    const permission = await this.getPermissionById(id);
    if (permission.isSystem) {
      throw new ForbiddenException('Default system Canteen permissions cannot be deleted.');
    }

    await this.prisma.canteenRolePermission.deleteMany({ where: { permissionId: id } });
    await this.prisma.canteenPermission.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenPermission',
      entityId: id,
      action: 'Canteen Permission Deleted',
      metadata: { key: permission.key },
    });

    return { message: `Canteen permission '${permission.key}' deleted successfully.` };
  }

  // --- User Role Assignments ---
  async getUserRoles(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.prisma.canteenUserRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  async assignUserRole(userId: string, dto: AssignUserCanteenRoleDto, actorUserId?: string) {
    if (actorUserId && actorUserId === userId) {
      throw new ForbiddenException('Users cannot assign Canteen roles to themselves.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Target user not found.');
    }

    const role = await this.getRoleById(dto.roleId);

    const existing = await this.prisma.canteenUserRole.findUnique({
      where: {
        userId_roleId: { userId, roleId: dto.roleId },
      },
    });

    if (existing) {
      throw new ConflictException(`Role '${role.name}' is already assigned to this user.`);
    }

    const userRole = await this.prisma.canteenUserRole.create({
      data: {
        userId,
        roleId: dto.roleId,
        assignedBy: actorUserId || null,
      },
      include: { role: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenUserRole',
      entityId: userRole.id,
      action: 'Canteen User Role Assigned',
      metadata: { targetUserId: userId, roleName: role.name },
    });

    return userRole;
  }

  async removeUserRole(userId: string, roleId: string, actorUserId?: string) {
    if (actorUserId && actorUserId === userId) {
      throw new ForbiddenException('Users cannot remove Canteen roles from themselves.');
    }

    const existing = await this.prisma.canteenUserRole.findUnique({
      where: {
        userId_roleId: { userId, roleId },
      },
    });

    if (!existing) {
      throw new NotFoundException('User role assignment not found.');
    }

    await this.prisma.canteenUserRole.delete({
      where: { id: existing.id },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenUserRole',
      entityId: existing.id,
      action: 'Canteen User Role Removed',
      metadata: { targetUserId: userId, roleId },
    });

    return { message: 'Canteen role removed from user successfully.' };
  }

  // --- Canteen User Management ---
  async createUser(dto: CreateCanteenUserDto, actorUserId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists.');
    }

    // Validate canteen role
    const canteenRole = await this.prisma.canteenRole.findUnique({
      where: { id: dto.roleId },
    });
    if (!canteenRole) {
      throw new NotFoundException('Specified Canteen role not found.');
    }

    // Get default system role for the user
    const defaultRole = await this.prisma.role.findFirst({
      where: { roleName: { in: ['User', 'Staff', 'Canteen Staff'] } },
    });
    const fallbackRole = defaultRole || (await this.prisma.role.findFirst());
    if (!fallbackRole) {
      throw new BadRequestException('No system role available in system. Please create a role first.');
    }
    const systemRoleId = fallbackRole.id;

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          roleId: systemRoleId,
        },
      });

      // Assign canteen role
      await tx.canteenUserRole.create({
        data: {
          userId: newUser.id,
          roleId: dto.roleId,
          assignedBy: actorUserId || null,
        },
      });

      return tx.user.findUnique({
        where: { id: newUser.id },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          canteenUserRoles: {
            include: {
              role: true,
            },
          },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'User',
      entityId: user!.id,
      action: 'Canteen User Created',
      metadata: { name: user!.name, email: user!.email, canteenRoleId: dto.roleId },
    });

    return user;
  }

  async getUsers() {
    return this.prisma.user.findMany({
      where: {
        canteenUserRoles: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        canteenUserRoles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        canteenUserRoles: {
          include: {
            role: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  async updateUser(userId: string, dto: UpdateCanteenUserDto, actorUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { canteenUserRoles: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('User with this email already exists.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (dto.name) updateData.name = dto.name;
      if (dto.email) updateData.email = dto.email;
      if (dto.password) updateData.passwordHash = await bcrypt.hash(dto.password, 10);

      await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (dto.roleId) {
        // Remove existing canteen roles
        await tx.canteenUserRole.deleteMany({
          where: { userId },
        });

        // Validate and assign new canteen role
        const canteenRole = await tx.canteenRole.findUnique({
          where: { id: dto.roleId },
        });
        if (!canteenRole) {
          throw new NotFoundException('Specified Canteen role not found.');
        }

        await tx.canteenUserRole.create({
          data: {
            userId,
            roleId: dto.roleId,
            assignedBy: actorUserId || null,
          },
        });
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          canteenUserRoles: {
            include: {
              role: true,
            },
          },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'User',
      entityId: userId,
      action: 'Canteen User Updated',
      metadata: { name: updated!.name, email: updated!.email },
    });

    return updated;
  }
}
