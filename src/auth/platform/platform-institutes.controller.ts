import { Body, ConflictException, Controller, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { InternalKeyGuard } from './internal-key.guard';

/** Role every institute's first admin gets; same name and full permission set as prisma/seed.ts. */
export const INSTITUTE_ADMIN_ROLE = 'Institute Administrator';

export class PlatformAdminUserDto {
  @IsString() @MinLength(1) name: string;
  @IsEmail() email: string;
  /** bcrypt hash; only used when the account is created, an existing password is never overwritten. */
  @Matches(/^\$2[aby]\$/) passwordHash: string;
  @IsString() @MinLength(1) platformUserId: string;
}

export class UpsertPlatformInstituteDto {
  @IsIn(['pending', 'active', 'suspended', 'rejected']) status: string;
  /** Optional so the role can be (re)synced for tenants that have no platform user yet. */
  @IsOptional() @ValidateNested() @Type(() => PlatformAdminUserDto) admin?: PlatformAdminUserDto;
}

/**
 * Called by eddva_platform when an institute is created or changes. The ERP has no institute table:
 * an institute is its id plus its roles and users, so provisioning means "make sure it has an admin
 * role with every permission and a first admin". Idempotent and never overwrites an existing password.
 */
@Controller('internal/platform/institutes')
@UseGuards(InternalKeyGuard)
export class PlatformInstitutesController {
  constructor(private readonly prisma: PrismaService) {}

  @Put(':instituteId')
  @HttpCode(200)
  async upsert(@Param('instituteId') instituteId: string, @Body() dto: UpsertPlatformInstituteDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role =
          (await tx.role.findFirst({ where: { roleName: INSTITUTE_ADMIN_ROLE, instituteId } })) ??
          (await tx.role.create({
            data: { roleName: INSTITUTE_ADMIN_ROLE, description: 'Full administrative access', instituteId },
          }));

        // Grant any permission the role is missing (new modules add permissions over time); never revoke.
        const have = new Set((await tx.rolePermission.findMany({ where: { roleId: role.id } })).map((r) => r.permissionId));
        const missing = (await tx.permission.findMany({ select: { id: true } })).filter((p) => !have.has(p.id));
        if (missing.length) {
          await tx.rolePermission.createMany({
            data: missing.map((p) => ({ roleId: role.id, permissionId: p.id })),
            skipDuplicates: true,
          });
        }

        const adminUserId = dto.admin ? await this.ensureAdmin(tx, instituteId, role.id, dto.admin) : null;
        return { instituteId, roleId: role.id, adminUserId, permissionsGranted: missing.length };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Admin email or platform user is already used by another ERP user');
      }
      throw err;
    }
  }

  private async ensureAdmin(tx: Prisma.TransactionClient, instituteId: string, roleId: string, admin: PlatformAdminUserDto) {
    const linked = await tx.user.findUnique({ where: { platformUserId: admin.platformUserId } });
    if (linked) return linked.id;

    const byEmail = await tx.user.findFirst({ where: { email: { equals: admin.email, mode: 'insensitive' } } });
    if (byEmail) {
      if (byEmail.instituteId !== instituteId) throw new ConflictException('Admin email belongs to a user of another institute');
      if (byEmail.platformUserId) throw new ConflictException('Admin email is already linked to another platform user');
      await tx.user.update({ where: { id: byEmail.id }, data: { platformUserId: admin.platformUserId } });
      return byEmail.id;
    }

    const created = await tx.user.create({
      data: {
        instituteId,
        name: admin.name,
        email: admin.email,
        passwordHash: admin.passwordHash,
        roleId,
        platformUserId: admin.platformUserId,
      },
    });
    return created.id;
  }
}
