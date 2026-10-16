import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { requireModuleSecret } from '../../common/utils/module-secret.util';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../../common/auth/institute-admin-role-names';
import { verifyErpToken, resolveErpIdentity } from '../../common/auth/erp-token.util';
import { hashSessionToken } from '../../common/auth/session-hash.util';

export interface TransportPlatformUser {
  eddva_user_id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string;
  is_institute_admin: boolean;
  role_id?: number;
  role_name?: string;
  permissions?: any;
}

/**
 * TransportAuthService — SSO token validation and Transport JWT issuance.
 * Mirrors FrontOfficeAuthService/InventoryAuthService exactly: an
 * independent auth space for Transport staff (admin/dispatcher/driver app
 * user), who may or may not exist as core `users` rows.
 */
@Injectable()
export class TransportAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get transportJwtSecret(): string {
    return requireModuleSecret('TRANSPORT_JWT_SECRET');
  }

  private isAdminRole(role: string): boolean {
    return (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(role);
  }

  /**
   * Validate EDDVA Institute Admin token and exchange it for a Transport Platform JWT.
   */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    transport_token: string;
    user: TransportPlatformUser;
    redirect: string;
  }> {
    const decoded = verifyErpToken(eddvaToken);
    const { eddva_user_id, institute_id, user_role, user_email, user_name } =
      resolveErpIdentity(decoded);

    const platformUser: TransportPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: this.isAdminRole(user_role),
    };

    const expiresIn = 60 * 60 * 24; // 24 hours
    const transport_token = jwt.sign(
      { ...platformUser },
      this.transportJwtSecret,
      { expiresIn },
    );

    const expires_at = new Date(Date.now() + expiresIn * 1000);
    try {
      await this.prisma.transportSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          // Hashed, never the raw signed JWT — a leaked DB row must not be
          // directly usable as a session token (see Phase 1 SSO cleanup).
          token_hash: hashSessionToken(transport_token),
          expires_at,
        },
      });
    } catch (err) {
      console.error('Failed to log Transport SSO session:', err);
    }

    return {
      transport_token,
      user: platformUser,
      redirect: '/transport/permissions',
    };
  }

  /**
   * Direct login for assigned role users (Admin, Dispatcher, Driver App User).
   */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
    instituteId?: string,
  ): Promise<{
    transport_token: string;
    user: TransportPlatformUser & { role_name: string; permissions: any };
  }> {
    // (institute_id, username) is the unique key, so the same username can exist in two
    // institutes. Refuse to guess between them; the caller can pass institute_id.
    const matches = await this.prisma.transportUserDynamicRole.findMany({
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
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    const isValid = await bcrypt.compare(rawPassword, assignment.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const platformUser: TransportPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24;
    const transport_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
      this.transportJwtSecret,
      { expiresIn },
    );

    return {
      transport_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions as any,
      },
    };
  }

  /**
   * Verify a Transport Platform JWT (used by TransportJwtGuard).
   *
   * Defensively extracts/validates the payload shape instead of trusting
   * `jwt.verify`'s return blindly, so a malformed/foreign token fails
   * cleanly with 401 rather than crashing a downstream Prisma call with
   * undefined fields.
   */
  verifyTransportToken(token: string): TransportPlatformUser {
    try {
      const decoded = jwt.verify(token, this.transportJwtSecret) as jwt.JwtPayload;
      const eddva_user_id = decoded.eddva_user_id || decoded.id || decoded.sub;
      const institute_id = decoded.institute_id || decoded.instituteId || decoded.tenantId;
      const user_role = String(decoded.user_role || decoded.role || '').toUpperCase();

      if (typeof eddva_user_id !== 'string' || typeof institute_id !== 'string') {
        throw new UnauthorizedException('Transport Platform session is missing required user details');
      }

      const user_email = typeof decoded.user_email === 'string'
        ? decoded.user_email
        : typeof decoded.email === 'string'
          ? decoded.email
          : undefined;
      const user_name = typeof decoded.user_name === 'string'
        ? decoded.user_name
        : typeof decoded.name === 'string'
          ? decoded.name
          : typeof decoded.fullName === 'string'
            ? decoded.fullName
            : user_email?.split('@')[0] || 'Transport User';

      return {
        eddva_user_id,
        institute_id,
        user_name,
        user_email,
        user_role,
        is_institute_admin:
          decoded.is_institute_admin === true || this.isAdminRole(user_role),
        role_id: typeof decoded.role_id === 'number' ? decoded.role_id : undefined,
        role_name: typeof decoded.role_name === 'string' ? decoded.role_name : undefined,
        permissions: decoded.permissions,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Transport Platform session');
    }
  }
}
