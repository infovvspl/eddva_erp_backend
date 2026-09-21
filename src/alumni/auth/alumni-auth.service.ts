import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../common/institute-admin-role-names';

export interface AlumniPlatformUser {
  eddva_user_id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string;
  is_institute_admin: boolean;
  role_id?: number;
  role_name?: string;
  permissions?: unknown;
  /**
   * Populated ONLY by AlumniPermissionsGuard from the live account row (never
   * from the token): set for alumni-portal accounts, undefined for staff.
   */
  alumni_id?: number;
  /** Portal accounts: the linked profile is verified (also guard-populated). */
  alumni_verified?: boolean;
}

/** Claims we read from the EDDVA ERP token exchanged at SSO. */
interface ErpTokenClaims {
  id?: string;
  sub?: string;
  role?: string;
  instituteId?: string;
  institute_id?: string;
  tenantId?: string;
  email?: string;
  name?: string;
  fullName?: string;
  userName?: string;
}

/** Claims of an Alumni JWT — untrusted until each field is type-checked. */
interface AlumniTokenClaims {
  eddva_user_id?: unknown;
  institute_id?: unknown;
  user_role?: unknown;
  user_email?: unknown;
  user_name?: unknown;
  is_institute_admin?: unknown;
  role_id?: unknown;
  role_name?: unknown;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

type AssignmentWithRole = Prisma.AlumniUserDynamicRoleGetPayload<{
  include: { role: true };
}>;

/**
 * AlumniAuthService — SSO token validation and Alumni JWT issuance.
 * Mirrors HostelAuthService / AdmissionAuthService: an independent auth space
 * for alumni-office staff AND for alumni-portal accounts, none of whom need to
 * exist as core `users` rows. Nothing here reads core tables.
 */
@Injectable()
export class AlumniAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private verifyErpToken(token: string): ErpTokenClaims {
    const secrets = [
      process.env.SCHOOL_JWT_SECRET,
      process.env.JWT_SECRET,
      process.env.JWT_SECRET ? `${process.env.JWT_SECRET}_school` : undefined,
    ].filter((secret): secret is string => Boolean(secret));

    if (secrets.length === 0) {
      throw new Error('SCHOOL_JWT_SECRET or JWT_SECRET must be set');
    }

    for (const secret of [...new Set(secrets)]) {
      try {
        return jwt.verify(token, secret) as ErpTokenClaims;
      } catch {
        // Try the next configured ERP signing secret.
      }
    }

    throw new UnauthorizedException('Invalid or expired EDDVA session token');
  }

  /**
   * Deliberately has NO fallback to JWT_SECRET: an Alumni secret that falls
   * back to the shared ERP secret lets a bare core Institute Admin JWT pass
   * AlumniJwtGuard without going through SSO exchange, defeating the module's
   * auth isolation. Fail closed instead.
   */
  private get alumniJwtSecret(): string {
    const secret = process.env.ALUMNI_JWT_SECRET;
    if (!secret) {
      throw new Error(
        'ALUMNI_JWT_SECRET must be set (it must differ from JWT_SECRET)',
      );
    }
    return secret;
  }

  private isAdminRole(role: string): boolean {
    return (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(role);
  }

  /** Validate an EDDVA Institute Admin token and exchange it for an Alumni JWT. */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    alumni_token: string;
    user: AlumniPlatformUser;
    redirect: string;
  }> {
    const decoded = this.verifyErpToken(eddvaToken);

    const eddva_user_id = decoded.id || decoded.sub;
    const user_role = (decoded.role || '').toUpperCase();
    const institute_id =
      decoded.instituteId || decoded.institute_id || decoded.tenantId || '';
    const user_email = decoded.email;
    const user_name =
      decoded.name ||
      decoded.fullName ||
      decoded.userName ||
      (user_email ? user_email.split('@')[0] : 'Institute Admin');

    if (!eddva_user_id || !institute_id) {
      throw new UnauthorizedException(
        'Token missing required fields (user id or institute id)',
      );
    }

    const platformUser: AlumniPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: this.isAdminRole(user_role),
    };

    const alumni_token = jwt.sign({ ...platformUser }, this.alumniJwtSecret, {
      expiresIn: TOKEN_TTL_SECONDS,
    });

    try {
      await this.prisma.alumniSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          token_hash: createHash('sha256').update(alumni_token).digest('hex'),
          expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
        },
      });
    } catch (err) {
      console.error('Failed to log Alumni SSO session:', err);
    }

    return {
      alumni_token,
      user: platformUser,
      redirect: '/alumni/permissions',
    };
  }

  /** Signs the login response for an assignment (staff user or alumni-portal account). */
  buildLogin(assignment: AssignmentWithRole): {
    alumni_token: string;
    user: AlumniPlatformUser & {
      role_name: string;
      permissions: unknown;
      alumni_id?: number;
    };
  } {
    const platformUser: AlumniPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const alumni_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
      },
      this.alumniJwtSecret,
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    return {
      alumni_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
        // Informational only for the client: the server never reads this back from the token.
        alumni_id: assignment.alumni_id ?? undefined,
      },
    };
  }

  /** Direct login for assigned users: Alumni Relations Officers, other office staff and alumni-portal accounts. */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
    instituteId?: string,
  ) {
    // (institute_id, username) is the unique key, so the same username can exist
    // in two institutes. Refuse to guess between them.
    const matches = await this.prisma.alumniUserDynamicRole.findMany({
      where: {
        OR: [
          { username: { equals: usernameOrEmail, mode: 'insensitive' } },
          { user_email: { equals: usernameOrEmail, mode: 'insensitive' } },
        ],
        is_active: true,
        ...(instituteId ? { institute_id: instituteId } : {}),
      },
      include: { role: true, alumni: { select: { is_active: true } } },
      take: 2,
    });

    if (matches.length > 1) {
      throw new BadRequestException(
        'More than one account matches these credentials. Provide institute_id to log in.',
      );
    }
    const assignment = matches[0];
    if (!assignment) {
      throw new UnauthorizedException(
        'Invalid credentials or inactive account',
      );
    }

    const isValid = await bcrypt.compare(rawPassword, assignment.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (assignment.alumni_id !== null && !assignment.alumni?.is_active) {
      throw new UnauthorizedException(
        'Invalid credentials or inactive account',
      );
    }

    return this.buildLogin(assignment);
  }

  /** Lets any assigned user (staff or alumnus) rotate their own password. */
  async changePassword(
    actor: AlumniPlatformUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const assignment = await this.prisma.alumniUserDynamicRole.findFirst({
      where: {
        institute_id: actor.institute_id,
        eddva_user_id: actor.eddva_user_id,
        is_active: true,
      },
    });
    if (!assignment) {
      throw new BadRequestException(
        'Only accounts with an assigned Alumni login can change a password here',
      );
    }
    if (!(await bcrypt.compare(currentPassword, assignment.password_hash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.alumniUserDynamicRole.update({
      where: { id: assignment.id },
      data: { password_hash: await bcrypt.hash(newPassword, 10) },
    });
    return { success: true };
  }

  /**
   * Verify an Alumni JWT (used by AlumniJwtGuard). Defensively validates the
   * payload shape so a malformed token fails with 401 rather than crashing a
   * downstream Prisma call with undefined fields. `alumni_id` is deliberately
   * NOT read from the token: it is resolved from the database by the
   * permissions guard.
   */
  verifyAlumniToken(token: string): AlumniPlatformUser {
    const secret = this.alumniJwtSecret;
    try {
      const decoded = jwt.verify(token, secret) as AlumniTokenClaims;
      const eddva_user_id = decoded.eddva_user_id;
      const institute_id = decoded.institute_id;
      const user_role =
        typeof decoded.user_role === 'string'
          ? decoded.user_role.toUpperCase()
          : '';

      if (
        typeof eddva_user_id !== 'string' ||
        typeof institute_id !== 'string'
      ) {
        throw new UnauthorizedException(
          'Alumni session is missing required user details',
        );
      }

      const user_email =
        typeof decoded.user_email === 'string' ? decoded.user_email : undefined;
      const user_name =
        typeof decoded.user_name === 'string'
          ? decoded.user_name
          : user_email?.split('@')[0] || 'Alumni User';

      return {
        eddva_user_id,
        institute_id,
        user_name,
        user_email,
        user_role,
        is_institute_admin:
          decoded.is_institute_admin === true || this.isAdminRole(user_role),
        role_id:
          typeof decoded.role_id === 'number' ? decoded.role_id : undefined,
        role_name:
          typeof decoded.role_name === 'string' ? decoded.role_name : undefined,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Alumni session');
    }
  }
}
