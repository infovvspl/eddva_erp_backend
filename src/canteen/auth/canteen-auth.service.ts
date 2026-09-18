import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from './institute-admin-role-names';

export interface CanteenPlatformUser {
  id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string;
  is_institute_admin: boolean;
}

/**
 * CanteenAuthService — SSO token validation and Canteen JWT issuance.
 * Mirrors SalesPurchaseAuthService/InventoryAuthService/TransportAuthService:
 * an independent auth space for Canteen staff, decoupled from the core
 * `users` table. Unlike Sales-Purchase's single-role-per-assignment model,
 * Canteen supports multiple roles per user, so the issued token carries only
 * the actor's identity (`id`) — permissions are always resolved live via
 * CanteenAccessService, never embedded in the token.
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

  private get canteenJwtSecret(): string {
    return (
      process.env.CANTEEN_JWT_SECRET ||
      process.env.JWT_SECRET ||
      'canteen_dev_secret'
    );
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
      id: eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: (
        INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]
      ).includes(user_role),
    };

    const expiresIn = 60 * 60 * 24; // 24 hours
    const canteen_token = jwt.sign(
      { ...platformUser },
      this.canteenJwtSecret,
      { expiresIn },
    );

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
      redirect: '/canteen',
    };
  }

  /**
   * Direct login for assigned Canteen users (Manager, Counter Staff, etc.).
   */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
  ): Promise<{ canteen_token: string; user: CanteenPlatformUser }> {
    const canteenUser = await this.prisma.canteenUser.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
        is_active: true,
      },
    });

    if (!canteenUser) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    const isValid = await bcrypt.compare(rawPassword, canteenUser.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const platformUser: CanteenPlatformUser = {
      id: canteenUser.id,
      institute_id: canteenUser.institute_id,
      user_name: canteenUser.name,
      user_email: canteenUser.email ?? undefined,
      user_role: 'CANTEEN_USER',
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24;
    const canteen_token = jwt.sign({ ...platformUser }, this.canteenJwtSecret, {
      expiresIn,
    });

    return { canteen_token, user: platformUser };
  }

  /**
   * Verify a Canteen Platform JWT (used by CanteenJwtGuard).
   *
   * Defensively extracts/validates the payload shape instead of trusting
   * `jwt.verify`'s return blindly — a token signed with the same secret but
   * the wrong payload shape (e.g. the core ERP token, since
   * CANTEEN_JWT_SECRET falls back to JWT_SECRET) must fail cleanly with 401
   * rather than crash a downstream Prisma call with undefined fields.
   */
  verifyCanteenToken(token: string): CanteenPlatformUser {
    try {
      const decoded = jwt.verify(token, this.canteenJwtSecret) as jwt.JwtPayload;
      const id = decoded.id;
      const institute_id =
        decoded.institute_id || decoded.instituteId || decoded.tenantId;
      const user_role = String(decoded.user_role || decoded.role || '').toUpperCase();

      if (typeof id !== 'string' || typeof institute_id !== 'string') {
        throw new UnauthorizedException(
          'Canteen Platform session is missing required user details',
        );
      }

      const user_email =
        typeof decoded.user_email === 'string' ? decoded.user_email : undefined;
      const user_name =
        typeof decoded.user_name === 'string'
          ? decoded.user_name
          : user_email?.split('@')[0] || 'Canteen User';

      return {
        id,
        institute_id,
        user_name,
        user_email,
        user_role,
        is_institute_admin:
          decoded.is_institute_admin === true ||
          (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(user_role),
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Canteen Platform session');
    }
  }
}
