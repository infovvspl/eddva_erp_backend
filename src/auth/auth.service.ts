import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private buildUserAccess(roleName: string, permissions: string[]) {
    const application = 'INSTITUTE_ADMIN';
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

    const userAccess = this.buildUserAccess(user.role.roleName, permissions);

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

    const userAccess = this.buildUserAccess(user.role?.roleName || '', permissions);

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
}
