import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../common/institute-admin-role-names';

export interface CanteenPlatformUser {
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
 * CanteenAuthService — SSO token validation and Canteen JWT issuance.
 * Mirrors SalesPurchaseAuthService: an independent auth space for Canteen
 * staff (Counter Staff/Canteen Manager/etc.), who may or may not exist as
 * core `users` rows.
 */
@Injectable()
export class CanteenAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private verifyErpToken(token: string): any {
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
        return jwt.verify(token, secret);
      } catch {
        // Try the next configured ERP signing secret.
      }
    }

    throw new UnauthorizedException('Invalid or expired EDDVA session token');
  }

  /**
   * Deliberately has NO fallback to JWT_SECRET (unlike a naive mirror of the
   * other modules). A Canteen secret that falls back to the shared ERP secret
   * lets a bare core Institute Admin JWT pass CanteenJwtGuard without ever
   * going through SSO exchange, defeating the module's auth isolation. Fail
   * closed instead.
   */
  private get canteenJwtSecret(): string {
    const secret = process.env.CANTEEN_JWT_SECRET;
    if (!secret) {
      throw new Error(
        'CANTEEN_JWT_SECRET must be set (it must differ from JWT_SECRET)',
      );
    }
    return secret;
  }

  /**
   * Validate EDDVA Institute Admin token and exchange it for a Canteen
   * Platform JWT.
   */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    canteen_token: string;
    user: CanteenPlatformUser;
    redirect: string;
  }> {
    const decoded = this.verifyErpToken(eddvaToken);

    const eddva_user_id: string = decoded.id || decoded.sub;
    const user_role: string = (decoded.role || '').toUpperCase();
    const institute_id: string =
      decoded.instituteId || decoded.institute_id || decoded.tenantId || '';
    const user_email: string | undefined = decoded.email;
    const user_name: string =
      decoded.name ||
      decoded.fullName ||
      decoded.userName ||
      (user_email ? user_email.split('@')[0] : 'Institute Admin');

    if (!eddva_user_id || !institute_id) {
      throw new UnauthorizedException(
        'Token missing required fields (user id or institute id)',
      );
    }

    const platformUser: CanteenPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: (
        INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]
      ).includes(user_role),
    };

    const expiresIn = 60 * 60 * 24; // 24 hours
    const canteen_token = jwt.sign({ ...platformUser }, this.canteenJwtSecret, {
      expiresIn,
    });

    const expires_at = new Date(Date.now() + expiresIn * 1000);
    try {
      await this.prisma.canteenSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          canteen_token,
          expires_at,
        },
      });
    } catch (err) {
      console.error('Failed to log Canteen SSO session:', err);
    }

    return {
      canteen_token,
      user: platformUser,
      redirect: '/canteen/permissions',
    };
  }

  /**
   * Direct login for assigned role users (Counter Staff, Canteen Manager,
   * etc.).
   */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
  ): Promise<{
    canteen_token: string;
    user: CanteenPlatformUser & { role_name: string; permissions: any };
  }> {
    const assignment = await this.prisma.canteenUserDynamicRole.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { user_email: usernameOrEmail }],
        is_active: true,
      },
      include: { role: true },
    });

    if (!assignment) {
      throw new UnauthorizedException(
        'Invalid credentials or inactive account',
      );
    }

    const isValid = await bcrypt.compare(rawPassword, assignment.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const platformUser: CanteenPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24;
    const canteen_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
      this.canteenJwtSecret,
      { expiresIn },
    );

    return {
      canteen_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
    };
  }

  /**
   * Verify a Canteen Platform JWT (used by CanteenJwtGuard).
   *
   * Defensively extracts/validates the payload shape instead of trusting
   * `jwt.verify`'s return blindly, so a token with the wrong payload shape
   * fails cleanly with 401 rather than crashing a downstream Prisma call with
   * undefined fields.
   */
  verifyCanteenToken(token: string): CanteenPlatformUser {
    const secret = this.canteenJwtSecret;
    try {
      const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
      const eddva_user_id = decoded.eddva_user_id || decoded.id || decoded.sub;
      const institute_id =
        decoded.institute_id || decoded.instituteId || decoded.tenantId;
      const user_role = String(
        decoded.user_role || decoded.role || '',
      ).toUpperCase();

      if (
        typeof eddva_user_id !== 'string' ||
        typeof institute_id !== 'string'
      ) {
        throw new UnauthorizedException(
          'Canteen Platform session is missing required user details',
        );
      }

      const user_email =
        typeof decoded.user_email === 'string'
          ? decoded.user_email
          : typeof decoded.email === 'string'
            ? decoded.email
            : undefined;
      const user_name =
        typeof decoded.user_name === 'string'
          ? decoded.user_name
          : typeof decoded.name === 'string'
            ? decoded.name
            : typeof decoded.fullName === 'string'
              ? decoded.fullName
              : user_email?.split('@')[0] || 'Canteen User';

      return {
        eddva_user_id,
        institute_id,
        user_name,
        user_email,
        user_role,
        is_institute_admin:
          decoded.is_institute_admin === true ||
          (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(user_role),
        role_id:
          typeof decoded.role_id === 'number' ? decoded.role_id : undefined,
        role_name:
          typeof decoded.role_name === 'string' ? decoded.role_name : undefined,
        permissions: decoded.permissions,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(
        'Invalid or expired Canteen Platform session',
      );
    }
  }
}
