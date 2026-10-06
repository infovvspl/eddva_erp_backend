import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { requireModuleSecret } from '../../common/utils/module-secret.util';

export interface FrontOfficePlatformUser {
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
 * FrontOfficeAuthService — SSO token validation and Front Office JWT issuance.
 * Mirrors LibAuthService/SportsAuthService exactly: an independent auth space
 * for Front Office staff, who may or may not exist as core `users` rows.
 */
@Injectable()
export class FrontOfficeAuthService {
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

  private get frontOfficeJwtSecret(): string {
    return requireModuleSecret('FRONT_OFFICE_JWT_SECRET');
  }

  /**
   * Validate EDDVA Institute Admin token and exchange it for a Front Office Platform JWT.
   */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    front_office_token: string;
    user: FrontOfficePlatformUser;
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

    const platformUser: FrontOfficePlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: ['INSTITUTE_ADMIN', 'INSTITUTE ADMINISTRATOR', 'INSTITUTE_ADMINISTRATOR'].includes(user_role),
    };

    const expiresIn = 60 * 60 * 24; // 24 hours
    const front_office_token = jwt.sign(
      { ...platformUser },
      this.frontOfficeJwtSecret,
      { expiresIn },
    );

    const expires_at = new Date(Date.now() + expiresIn * 1000);
    try {
      await this.prisma.frontOfficeSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          fo_token: front_office_token,
          expires_at,
        },
      });
    } catch (err) {
      console.error('Failed to log Front Office SSO session:', err);
    }

    return {
      front_office_token,
      user: platformUser,
      redirect: '/front-office/permissions',
    };
  }

  /**
   * Direct login for assigned role users (Front Desk, Department Staff, Managers).
   */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
    instituteId?: string,
  ): Promise<{
    front_office_token: string;
    user: FrontOfficePlatformUser & { role_name: string; permissions: any };
  }> {
    // (institute_id, username) is the unique key, so the same username can exist in two
    // institutes. Refuse to guess between them; the caller can pass institute_id.
    const matches = await this.prisma.frontOfficeUserDynamicRole.findMany({
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

    const platformUser: FrontOfficePlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24;
    const front_office_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
      this.frontOfficeJwtSecret,
      { expiresIn },
    );

    return {
      front_office_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions as any,
      },
    };
  }

  /**
   * Verify a Front Office Platform JWT (used by FrontOfficeJwtGuard).
   *
   * Defensively extracts/validates the payload shape instead of trusting
   * `jwt.verify`'s return blindly — a token signed with the same secret but
   * the wrong payload shape (e.g. the core ERP token, since
   * FRONT_OFFICE_JWT_SECRET falls back to JWT_SECRET) must fail cleanly with
   * 401 rather than crash a downstream Prisma call with undefined fields.
   */
  verifyFrontOfficeToken(token: string): FrontOfficePlatformUser {
    try {
      const decoded = jwt.verify(token, this.frontOfficeJwtSecret) as jwt.JwtPayload;
      const eddva_user_id = decoded.eddva_user_id || decoded.id || decoded.sub;
      const institute_id = decoded.institute_id || decoded.instituteId || decoded.tenantId;
      const user_role = String(decoded.user_role || decoded.role || '').toUpperCase();

      if (typeof eddva_user_id !== 'string' || typeof institute_id !== 'string') {
        throw new UnauthorizedException('Front Office Platform session is missing required user details');
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
            : user_email?.split('@')[0] || 'Front Office User';

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
      throw new UnauthorizedException('Invalid or expired Front Office Platform session');
    }
  }
}
