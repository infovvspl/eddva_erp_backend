import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  private deriveUserAccess(roleName: string, permissions: string[]) {
    let application = 'INSTITUTE_ADMIN';

    if (
      (roleName.toUpperCase().includes('SALES') || roleName.toUpperCase().includes('PURCHASE')) &&
      !roleName.toUpperCase().includes('INSTITUTE')
    ) {
      application = 'SALES_PURCHASE';
    }

    return {
      application,
      access: {
        application,
        role: roleName,
        permissions,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.role || user.role.status !== 'ACTIVE') {
      throw new UnauthorizedException('User role is inactive or invalid.');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    let permissions = user.role.rolePermissions.map(
      (rp) => rp.permission.permissionKey,
    );

    const rNameUpper = (user.role.roleName || '').toUpperCase();
    if (
      rNameUpper === 'INSTITUTE ADMINISTRATOR' ||
      rNameUpper === 'SUPER_ADMIN' ||
      rNameUpper === 'INSTITUTE_ADMIN'
    ) {
      const allSys = await this.prisma.permission.findMany({ select: { permissionKey: true } });
      permissions = Array.from(new Set([...permissions, ...allSys.map((p) => p.permissionKey)]));
    }

    const userAccess = this.deriveUserAccess(user.role.roleName, permissions);

    const token = this.jwtService.sign({
      id: user.id,
      sub: user.id,
      role: user.role.roleName,
      email: user.email,
      instituteId: user.instituteId || null,
      application: userAccess.application,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        instituteId: user.instituteId || null,
        roleId: user.roleId,
        roleName: user.role.roleName,
        application: userAccess.application,
        access: userAccess.access,
        permissions,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    let permissions = user.role?.rolePermissions.map(
      (rp) => rp.permission.permissionKey,
    ) || [];

    const rNameUpper = (user.role?.roleName || '').toUpperCase();
    if (
      rNameUpper === 'INSTITUTE ADMINISTRATOR' ||
      rNameUpper === 'SUPER_ADMIN' ||
      rNameUpper === 'INSTITUTE_ADMIN'
    ) {
      const allSys = await this.prisma.permission.findMany({ select: { permissionKey: true } });
      permissions = Array.from(new Set([...permissions, ...allSys.map((p) => p.permissionKey)]));
    }

    const userAccess = this.deriveUserAccess(user.role?.roleName || '', permissions);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      instituteId: user.instituteId || null,
      roleId: user.roleId,
      roleName: user.role?.roleName || '',
      status: user.status,
      application: userAccess.application,
      access: userAccess.access,
      permissions,
    };
  }

  // --- Permission Catalog ---
  async getPermissions(instituteId?: string, appScope?: string) {
    let permissionWhere: any = {};

    if (appScope) {
      const scopeUpper = appScope.toUpperCase();
      if (scopeUpper === 'SALES_PURCHASE' || scopeUpper === 'SALES' || scopeUpper === 'PURCHASE') {
        permissionWhere.OR = [
          { permissionKey: { startsWith: 'sales.' } },
          { permissionKey: { startsWith: 'purchase.' } },
          { permissionKey: { startsWith: 'item.' } },
          { permissionKey: { startsWith: 'vendor.' } },
          { permissionKey: { startsWith: 'customer.' } },
        ];
      }
    }

    if (instituteId) {
      permissionWhere.OR = [{ instituteId }, { instituteId: null }];
    }

    return this.prisma.permission.findMany({
      where: permissionWhere,
      orderBy: { permissionKey: 'asc' },
    });
  }

  async getPermissionById(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found.');
    }
    return permission;
  }

  async createPermission(dto: CreatePermissionDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const existing = await this.prisma.permission.findFirst({
      where: {
        permissionKey: dto.permissionKey,
      },
    });

    if (existing) {
      throw new ConflictException(`Permission key '${dto.permissionKey}' already exists.`);
    }

    const permission = await this.prisma.permission.create({
      data: {
        permissionKey: dto.permissionKey,
        description: dto.description,
        instituteId: actorInstId || null,
        isSystem: false,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Permission',
      entityId: permission.id,
      action: 'Permission created',
      metadata: { permissionKey: permission.permissionKey, instituteId: actorInstId },
    });

    return permission;
  }

  async updatePermission(id: string, dto: UpdatePermissionDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const permission = await this.prisma.permission.findUnique({ where: { id } });
    if (!permission) {
      throw new NotFoundException('Permission not found.');
    }

    if (permission.isSystem || permission.instituteId === null) {
      throw new ForbiddenException('System permissions cannot be modified or deleted.');
    }

    if (actorInstId && permission.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute permission modification is forbidden.');
    }

    const updated = await this.prisma.permission.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Permission',
      entityId: id,
      action: 'Permission updated',
      metadata: { ...dto },
    });

    return updated;
  }

  async deletePermission(id: string, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const permission = await this.prisma.permission.findUnique({ where: { id } });
    if (!permission) {
      throw new NotFoundException('Permission not found.');
    }

    if (permission.isSystem || permission.instituteId === null) {
      throw new ForbiddenException('System permissions cannot be modified or deleted.');
    }

    if (actorInstId && permission.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute permission modification is forbidden.');
    }

    await this.prisma.rolePermission.deleteMany({
      where: { permissionId: id },
    });

    await this.prisma.permission.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Permission',
      entityId: id,
      action: 'Permission deleted',
      metadata: { permissionKey: permission.permissionKey, instituteId: actorInstId },
    });

    return { message: `Custom permission '${permission.permissionKey}' deleted successfully.` };
  }

  async getRoles(instituteId?: string, appScope?: string) {
    let roleWhere: any = {};
    if (instituteId) {
      roleWhere.OR = [{ instituteId }, { instituteId: null }];
    }

    if (appScope) {
      const scopeUpper = appScope.toUpperCase();
      if (scopeUpper === 'SALES_PURCHASE' || scopeUpper === 'SALES' || scopeUpper === 'PURCHASE') {
        roleWhere.rolePermissions = {
          some: {
            permission: {
              OR: [
                { permissionKey: { startsWith: 'sales.' } },
                { permissionKey: { startsWith: 'purchase.' } },
              ],
            },
          },
        };
      }
    }

    return this.prisma.role.findMany({
      where: roleWhere,
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { roleName: 'asc' },
    });
  }

  async getRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  private async resolvePermissions(
    permissionInputs?: string[],
    actorInstituteId?: string,
  ): Promise<string[]> {
    if (!permissionInputs || permissionInputs.length === 0) {
      return [];
    }

    const perms = await this.prisma.permission.findMany({
      where: {
        OR: [
          { id: { in: permissionInputs } },
          { permissionKey: { in: permissionInputs } },
        ],
      },
    });

    if (perms.length !== permissionInputs.length) {
      throw new BadRequestException('One or more invalid permission IDs or keys provided.');
    }

    for (const p of perms) {
      if (actorInstituteId && p.instituteId && p.instituteId !== actorInstituteId) {
        throw new ForbiddenException(`Permission '${p.permissionKey}' belongs to another institute.`);
      }
    }

    return perms.map((p) => p.id);
  }

  async createRole(dto: CreateRoleDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const creatorInstituteId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const existing = await this.prisma.role.findFirst({
      where: {
        roleName: dto.roleName,
        instituteId: creatorInstituteId || null,
      },
    });

    if (existing) {
      throw new ConflictException('A role with this name already exists in this institute.');
    }

    const resolvedPermIds = await this.resolvePermissions(dto.permissionIds, creatorInstituteId);

    const role = await this.prisma.$transaction(async (tx) => {
      const newRole = await tx.role.create({
        data: {
          roleName: dto.roleName,
          description: dto.description || null,
          instituteId: creatorInstituteId || null,
        },
      });

      if (resolvedPermIds.length > 0) {
        await tx.rolePermission.createMany({
          data: resolvedPermIds.map((permId) => ({
            roleId: newRole.id,
            permissionId: permId,
          })),
        });
      }

      return tx.role.findUnique({
        where: { id: newRole.id },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Role',
      entityId: role!.id,
      action: 'Role created',
      metadata: { roleName: role!.roleName, instituteId: creatorInstituteId },
    });

    return role;
  }

  async updateRole(id: string, dto: UpdateRoleDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (
      role.roleName === 'SUPER_ADMIN' ||
      role.roleName === 'INSTITUTE_ADMIN' ||
      role.roleName === 'Institute Administrator'
    ) {
      throw new ForbiddenException('System protected roles cannot be modified.');
    }

    if (actorInstId && role.instituteId && role.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute role modification is forbidden.');
    }

    if (dto.roleName && dto.roleName !== role.roleName) {
      const existing = await this.prisma.role.findFirst({
        where: {
          roleName: dto.roleName,
          instituteId: role.instituteId,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException('A role with this name already exists in this institute.');
      }
    }

    const resolvedPermIds = dto.permissionIds !== undefined
      ? await this.resolvePermissions(dto.permissionIds, actorInstId)
      : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.roleName && { roleName: dto.roleName }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.status && { status: dto.status }),
        },
      });

      if (resolvedPermIds !== undefined) {
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        });

        if (resolvedPermIds.length > 0) {
          await tx.rolePermission.createMany({
            data: resolvedPermIds.map((permId) => ({
              roleId: id,
              permissionId: permId,
            })),
          });
        }
      }

      return tx.role.findUnique({
        where: { id },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Role',
      entityId: id,
      action: 'Role updated',
      metadata: { ...dto },
    });

    return updated;
  }

  async assignRolePermissions(roleId: string, dto: AssignRolePermissionsDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (
      role.roleName === 'SUPER_ADMIN' ||
      role.roleName === 'INSTITUTE_ADMIN' ||
      role.roleName === 'Institute Administrator'
    ) {
      throw new ForbiddenException('System protected roles cannot be modified.');
    }

    if (actorInstId && role.instituteId && role.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute role permission assignment is forbidden.');
    }

    const resolvedPermIds = await this.resolvePermissions(dto.permissionIds, actorInstId);

    const updatedRole = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      if (resolvedPermIds.length > 0) {
        await tx.rolePermission.createMany({
          data: resolvedPermIds.map((pId) => ({
            roleId,
            permissionId: pId,
          })),
        });
      }

      return tx.role.findUnique({
        where: { id: roleId },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Role',
      entityId: roleId,
      action: 'Role permissions updated',
      metadata: { permissionIds: dto.permissionIds },
    });

    const activePermissions = updatedRole!.rolePermissions.map((rp) => rp.permission.permissionKey);
    return {
      roleId: updatedRole!.id,
      roleName: updatedRole!.roleName,
      permissions: activePermissions,
    };
  }

  async addPermissionToRole(roleId: string, permissionIdOrKey: string, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (
      role.roleName === 'SUPER_ADMIN' ||
      role.roleName === 'INSTITUTE_ADMIN' ||
      role.roleName === 'Institute Administrator'
    ) {
      throw new ForbiddenException('System protected roles cannot be modified.');
    }

    if (actorInstId && role.instituteId && role.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute role permission modification is forbidden.');
    }

    const resolvedPermIds = await this.resolvePermissions([permissionIdOrKey], actorInstId);
    const permId = resolvedPermIds[0];

    const existingLink = await this.prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId: permId,
        },
      },
    });

    if (!existingLink) {
      await this.prisma.rolePermission.create({
        data: {
          roleId,
          permissionId: permId,
        },
      });
    }

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Role',
      entityId: roleId,
      action: 'Permission added to role',
      metadata: { permissionIdOrKey },
    });

    return { message: 'Permission added to role successfully.', roleId, permissionId: permId };
  }

  async removePermissionFromRole(roleId: string, permissionIdOrKey: string, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (
      role.roleName === 'SUPER_ADMIN' ||
      role.roleName === 'INSTITUTE_ADMIN' ||
      role.roleName === 'Institute Administrator'
    ) {
      throw new ForbiddenException('System protected roles cannot be modified.');
    }

    if (actorInstId && role.instituteId && role.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute role permission modification is forbidden.');
    }

    const resolvedPermIds = await this.resolvePermissions([permissionIdOrKey], actorInstId);
    const permId = resolvedPermIds[0];

    await this.prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: permId,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Role',
      entityId: roleId,
      action: 'Permission removed from role',
      metadata: { permissionIdOrKey },
    });

    return { message: 'Permission removed from role successfully.', roleId, permissionId: permId };
  }

  async deleteRole(id: string, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (
      role.roleName === 'SUPER_ADMIN' ||
      role.roleName === 'INSTITUTE_ADMIN' ||
      role.roleName === 'Institute Administrator'
    ) {
      throw new ForbiddenException('System protected roles cannot be deleted.');
    }

    if (actorInstId && role.instituteId && role.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute role deletion is forbidden.');
    }

    if (role._count.users > 0) {
      throw new BadRequestException(`Cannot delete role: ${role._count.users} active user(s) are assigned to this role. Please reassign or deactivate users first.`);
    }

    await this.prisma.role.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'Role',
      entityId: id,
      action: 'Role deleted',
      metadata: { roleName: role.roleName },
    });

    return { message: `Role '${role.roleName}' deleted successfully.` };
  }

  // --- Dynamic User Management ---
  async getUsers(instituteId?: string, appScope?: string) {
    let userWhere: any = {};
    if (instituteId) {
      userWhere.instituteId = instituteId;
    }

    if (appScope) {
      const scopeUpper = appScope.toUpperCase();
      if (scopeUpper === 'SALES_PURCHASE' || scopeUpper === 'SALES' || scopeUpper === 'PURCHASE') {
        userWhere.role = {
          rolePermissions: {
            some: {
              permission: {
                OR: [
                  { permissionKey: { startsWith: 'sales.' } },
                  { permissionKey: { startsWith: 'purchase.' } },
                ],
              },
            },
          },
        };
      }
    }

    return this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        instituteId: true,
        roleId: true,
        status: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            roleName: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        instituteId: true,
        roleId: true,
        status: true,
        createdAt: true,
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async createUser(dto: CreateUserDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const creatorInstituteId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists.');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException('Specified role not found.');
    }

    if (creatorInstituteId && role.instituteId && role.instituteId !== creatorInstituteId) {
      throw new ForbiddenException('Cannot assign a role belonging to another institute.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        roleId: dto.roleId,
        instituteId: creatorInstituteId || null,
      },
      include: { role: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'User',
      entityId: user.id,
      action: 'User created',
      metadata: { name: user.name, email: user.email, roleId: user.roleId },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      instituteId: user.instituteId,
      roleId: user.roleId,
      roleName: user.role.roleName,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async updateUser(id: string, dto: UpdateUserDto, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (actorInstId && user.instituteId && user.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute user modification is forbidden.');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Another user with this email already exists.');
      }
    }

    let passwordHash: string | undefined;
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) {
        throw new NotFoundException('Specified role not found.');
      }
      if (actorInstId && role.instituteId && role.instituteId !== actorInstId) {
        throw new ForbiddenException('Cannot assign a role belonging to another institute.');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
        ...(passwordHash && { passwordHash }),
        ...(dto.roleId && { roleId: dto.roleId }),
        ...(dto.status && { status: dto.status }),
      },
      include: { role: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'User',
      entityId: id,
      action: 'User updated',
      metadata: { ...dto },
    });

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      instituteId: updatedUser.instituteId,
      roleId: updatedUser.roleId,
      roleName: updatedUser.role.roleName,
      status: updatedUser.status,
      updatedAt: updatedUser.updatedAt,
    };
  }

  async deleteUser(id: string, userParam?: any) {
    const actorUserId = typeof userParam === 'object' ? userParam?.id || userParam?.userId : undefined;
    const actorInstId = typeof userParam === 'object' ? userParam?.instituteId : userParam;

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (actorInstId && user.instituteId && user.instituteId !== actorInstId) {
      throw new ForbiddenException('Cross-institute user deletion is forbidden.');
    }

    if (user.role?.roleName === 'Institute Administrator' || user.email === 'admin@eddva.com') {
      throw new BadRequestException('Primary Institute Administrator cannot be deleted.');
    }

    await this.prisma.user.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'User',
      entityId: id,
      action: 'User deleted',
      metadata: { email: user.email },
    });

    return { message: `User '${user.name}' deleted successfully.` };
  }
}
