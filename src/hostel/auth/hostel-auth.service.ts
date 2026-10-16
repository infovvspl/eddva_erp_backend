import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../../common/auth/institute-admin-role-names';
import { verifyErpToken, resolveErpIdentity } from '../../common/auth/erp-token.util';
import { hashSessionToken } from '../../common/auth/session-hash.util';
import { requireModuleSecret } from '../../common/utils/module-secret.util';

export interface HostelPlatformUser {
  eddva_user_id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string;
  is_institute_admin: boolean;
  role_id?: number;
  role_name?: string;
  permissions?: unknown;
}

/** Claims of a Hostel JWT — untrusted until each field is type-checked. */
interface HostelTokenClaims {
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

/**
 * HostelAuthService — SSO token validation and Hostel JWT issuance.
 * Mirrors CanteenAuthService / SalesPurchaseAuthService: an independent auth
 * space for hostel staff (Warden/Gate Security/etc.), who
 * may or may not exist as core `users` rows. Nothing here reads core tables.
 */
@Injectable()
export class HostelAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * No fallback to JWT_SECRET: a Hostel secret that falls back to the
   * shared ERP secret lets a bare core Institute Admin JWT pass
   * HostelJwtGuard without going through SSO exchange, defeating the
   * module's auth isolation. requireModuleSecret fails closed the same way
   * this used to by hand, plus rejects a secret that collides with
   * JWT_SECRET/SCHOOL_JWT_SECRET.
   */
  private get hostelJwtSecret(): string {
    return requireModuleSecret('HOSTEL_JWT_SECRET');
  }

  private isAdminRole(role: string): boolean {
    return (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(role);
  }

  /** Validate an EDDVA Institute Admin token and exchange it for a Hostel JWT. */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    hostel_token: string;
    user: HostelPlatformUser;
    redirect: string;
  }> {
    const decoded = verifyErpToken(eddvaToken);
    const { eddva_user_id, institute_id, user_role, user_email, user_name } =
      resolveErpIdentity(decoded);

    const platformUser: HostelPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: this.isAdminRole(user_role),
    };

    const hostel_token = jwt.sign({ ...platformUser }, this.hostelJwtSecret, {
      expiresIn: TOKEN_TTL_SECONDS,
    });

    try {
      await this.prisma.hostelSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          token_hash: hashSessionToken(hostel_token),
          expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
        },
      });
    } catch (err) {
      console.error('Failed to log Hostel SSO session:', err);
    }

    return {
      hostel_token,
      user: platformUser,
      redirect: '/hostel/permissions',
    };
  }

  /** Direct login for assigned role users (Warden, Gate Security, Hostel Accountant, etc.). */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
    instituteId?: string,
  ): Promise<{
    hostel_token: string;
    user: HostelPlatformUser & { role_name: string; permissions: unknown };
  }> {
    // (institute_id, username) is the unique key, so the same username can exist
    // in two institutes. Refuse to guess between them.
    const matches = await this.prisma.hostelUserDynamicRole.findMany({
      where: {
        OR: [{ username: usernameOrEmail }, { user_email: usernameOrEmail }],
        is_active: true,
        ...(instituteId ? { institute_id: instituteId } : {}),
      },
      include: { role: true },
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

    const platformUser: HostelPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const hostel_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
      },
      this.hostelJwtSecret,
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    return {
      hostel_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
    };
  }

  /**
   * Verify a Hostel JWT (used by HostelJwtGuard). Defensively validates
   * the payload shape so a malformed token fails with 401 rather than crashing
   * a downstream Prisma call with undefined fields.
   */
  verifyHostelToken(token: string): HostelPlatformUser {
    const secret = this.hostelJwtSecret;
    try {
      const decoded = jwt.verify(token, secret) as HostelTokenClaims;
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
          'Hostel session is missing required user details',
        );
      }

      const user_email =
        typeof decoded.user_email === 'string' ? decoded.user_email : undefined;
      const user_name =
        typeof decoded.user_name === 'string'
          ? decoded.user_name
          : user_email?.split('@')[0] || 'Hostel User';

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
      throw new UnauthorizedException('Invalid or expired Hostel session');
    }
  }
}
