import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

export interface InventoryPlatformUser {
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
 * InventoryAuthService — SSO token validation and Inventory JWT issuance.
 * Mirrors FrontOfficeAuthService/LibAuthService/SportsAuthService exactly:
 * an independent auth space for Inventory staff (admin/store_keeper/
 * approver), who may or may not exist as core `users` rows.
 */
@Injectable()
export class InventoryAuthService {
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

  private get inventoryJwtSecret(): string {
    return (
      process.env.INVENTORY_JWT_SECRET ||
      process.env.JWT_SECRET ||
      'inventory_dev_secret'
    );
  }

  /**
   * Validate EDDVA Institute Admin token and exchange it for an Inventory Platform JWT.
   */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    inventory_token: string;
    user: InventoryPlatformUser;
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
      throw new UnauthorizedException('Token missing required fields (user id or institute id)');
    }

    const platformUser: InventoryPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: ['INSTITUTE_ADMIN', 'INSTITUTE ADMINISTRATOR', 'INSTITUTE_ADMINISTRATOR'].includes(user_role),
    };

    const expiresIn = 60 * 60 * 24; // 24 hours
    const inventory_token = jwt.sign(
      { ...platformUser },
      this.inventoryJwtSecret,
      { expiresIn },
    );

    const expires_at = new Date(Date.now() + expiresIn * 1000);
    try {
      await this.prisma.inventorySsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          inv_token: inventory_token,
          expires_at,
        },
      });
    } catch (err) {
      console.error('Failed to log Inventory SSO session:', err);
    }

    return {
      inventory_token,
      user: platformUser,
      redirect: '/inventory/permissions',
    };
  }

  /**
   * Direct login for assigned role users (Admin, Store Keeper, Approver).
   */
  async directLogin(usernameOrEmail: string, rawPassword: string): Promise<{
    inventory_token: string;
    user: InventoryPlatformUser & { role_name: string; permissions: any };
  }> {
    const assignment = await this.prisma.inventoryUserDynamicRole.findFirst({
      where: {
        OR: [
          { username: usernameOrEmail },
          { user_email: usernameOrEmail },
        ],
        is_active: true,
      },
      include: { role: true },
    });

    if (!assignment) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    const isValid = await bcrypt.compare(rawPassword, assignment.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const platformUser: InventoryPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24;
    const inventory_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
      this.inventoryJwtSecret,
      { expiresIn },
    );

    return {
      inventory_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions as any,
      },
    };
  }

  /**
   * Verify an Inventory Platform JWT (used by InventoryJwtGuard).
   *
   * Defensively extracts/validates the payload shape instead of trusting
   * `jwt.verify`'s return blindly — a token signed with the same secret but
   * the wrong payload shape (e.g. the core ERP token, since
   * INVENTORY_JWT_SECRET falls back to JWT_SECRET) must fail cleanly with
   * 401 rather than crash a downstream Prisma call with undefined fields.
   */
  verifyInventoryToken(token: string): InventoryPlatformUser {
    try {
      const decoded = jwt.verify(token, this.inventoryJwtSecret) as jwt.JwtPayload;
      const eddva_user_id = decoded.eddva_user_id || decoded.id || decoded.sub;
      const institute_id = decoded.institute_id || decoded.instituteId || decoded.tenantId;
      const user_role = String(decoded.user_role || decoded.role || '').toUpperCase();

      if (typeof eddva_user_id !== 'string' || typeof institute_id !== 'string') {
        throw new UnauthorizedException('Inventory Platform session is missing required user details');
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
            : user_email?.split('@')[0] || 'Inventory User';

      return {
        eddva_user_id,
        institute_id,
        user_name,
        user_email,
        user_role,
        is_institute_admin:
          decoded.is_institute_admin === true ||
          ['INSTITUTE_ADMIN', 'INSTITUTE ADMINISTRATOR', 'INSTITUTE_ADMINISTRATOR'].includes(user_role),
        role_id: typeof decoded.role_id === 'number' ? decoded.role_id : undefined,
        role_name: typeof decoded.role_name === 'string' ? decoded.role_name : undefined,
        permissions: decoded.permissions,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Inventory Platform session');
    }
  }
}
