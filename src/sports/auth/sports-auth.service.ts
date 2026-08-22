import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

export interface SportsPlatformUser {
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

@Injectable()
export class SportsAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get schoolJwtSecret(): string {
    const base = process.env.SCHOOL_JWT_SECRET || process.env.JWT_SECRET;
    if (!base) throw new Error('SCHOOL_JWT_SECRET or JWT_SECRET must be set');
    return process.env.SCHOOL_JWT_SECRET ?? `${base}_school`;
  }

  private get sportsJwtSecret(): string {
    return (
      process.env.SPORTS_JWT_SECRET ||
      process.env.JWT_SECRET ||
      'sports_dev_secret'
    );
  }

  /**
   * Validate EDDVA Institute Admin token and exchange it for a Sports Platform JWT token.
   */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    sports_token: string;
    user: SportsPlatformUser;
    redirect: string;
  }> {
    let decoded: any;
    try {
      decoded = jwt.verify(eddvaToken, this.schoolJwtSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired EDDVA session token');
    }

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

    const platformUser: SportsPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: user_role === 'INSTITUTE_ADMIN',
    };

    const expiresIn = 60 * 60 * 24; // 24 hours
    const sports_token = jwt.sign(
      { ...platformUser },
      this.sportsJwtSecret,
      { expiresIn },
    );

    const expires_at = new Date(Date.now() + expiresIn * 1000);
    try {
      await this.prisma.sportsSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          sports_token,
          expires_at,
        },
      });
    } catch (err) {
      console.error('Failed to log Sports SSO session:', err);
    }

    return {
      sports_token,
      user: platformUser,
      redirect: '/sports/permissions',
    };
  }

  /**
   * Direct login for assigned role users (Coaches, House Masters, Sports Admins).
   */
  async directLogin(usernameOrEmail: string, rawPassword: string): Promise<{
    sports_token: string;
    user: SportsPlatformUser & { role_name: string; permissions: any };
  }> {
    const assignment = await this.prisma.sportsUserDynamicRole.findFirst({
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

    const platformUser: SportsPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24;
    const sports_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
      this.sportsJwtSecret,
      { expiresIn },
    );

    return {
      sports_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions as any,
      },
    };
  }

  /**
   * Verify a Sports Platform JWT (used by SportsJwtGuard).
   */
  verifySportsToken(token: string): SportsPlatformUser {
    try {
      return jwt.verify(token, this.sportsJwtSecret) as SportsPlatformUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired Sports Platform session');
    }
  }
}
