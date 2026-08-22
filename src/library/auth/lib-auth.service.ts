import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

export interface LibPlatformUser {
  eddva_user_id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string; // e.g. "INSTITUTE_ADMIN", "TEACHER", "STAFF"
  is_institute_admin: boolean;
}

/**
 * LibAuthService — SSO token validation and Library JWT issuance.
 *
 * Flow:
 *  1. Receives EDDVA JWT token (from ERPWorkspace.jsx redirect).
 *  2. Validates it using SCHOOL_JWT_SECRET (same secret used by eddva_backend).
 *  3. Issues a short-lived Library Platform JWT (signed with LIBRARY_JWT_SECRET).
 *  4. Persists a LibSsoSession record for auditing.
 */
@Injectable()
export class LibAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get schoolJwtSecret(): string {
    const base = process.env.SCHOOL_JWT_SECRET || process.env.JWT_SECRET;
    if (!base) throw new Error('SCHOOL_JWT_SECRET or JWT_SECRET must be set');
    // EDDVA school module appends '_school' if SCHOOL_JWT_SECRET is not explicitly set
    return process.env.SCHOOL_JWT_SECRET ?? `${base}_school`;
  }

  private get libraryJwtSecret(): string {
    return (
      process.env.LIBRARY_JWT_SECRET ||
      process.env.JWT_SECRET ||
      'library_dev_secret'
    );
  }

  /**
   * Validate the EDDVA Institute Admin JWT and exchange it for a Library Platform JWT.
   */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    library_token: string;
    user: LibPlatformUser;
    redirect: string;
  }> {
    // 1. Verify EDDVA token
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

    const platformUser: LibPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: user_role === 'INSTITUTE_ADMIN',
    };

    // 2. Issue Library JWT (24h expiry)
    const expiresIn = 60 * 60 * 24; // 24 hours in seconds
    const library_token = jwt.sign(
      { ...platformUser },
      this.libraryJwtSecret,
      { expiresIn },
    );

    // 3. Persist SSO session for audit
    const expires_at = new Date(Date.now() + expiresIn * 1000);
    try {
      await this.prisma.libSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          lib_token: library_token,
          expires_at,
        },
      });
    } catch (err) {
      console.error('Failed to log Library SSO session:', err);
    }

    return {
      library_token,
      user: platformUser,
      redirect: '/library/permissions',
    };
  }

  /**
   * Direct login for assigned role users (Librarians, Assistant Librarians, etc.)
   * using credentials created by the Institute Admin.
   */
  async directLogin(usernameOrEmail: string, rawPassword: string): Promise<{
    library_token: string;
    user: LibPlatformUser & { role_name: string; permissions: any };
  }> {
    // Find assignment by username OR user_email
    const assignment = await this.prisma.libUserDynamicRole.findFirst({
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

    // Verify password hash
    const isValid = await bcrypt.compare(rawPassword, assignment.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const platformUser: LibPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const expiresIn = 60 * 60 * 24; // 24h
    const library_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
      this.libraryJwtSecret,
      { expiresIn },
    );

    return {
      library_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions as any,
      },
    };
  }

  /**
   * Verify a Library Platform JWT (used by LibJwtGuard).
   */
  verifyLibraryToken(token: string): LibPlatformUser {
    try {
      return jwt.verify(token, this.libraryJwtSecret) as LibPlatformUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired Library Platform session');
    }
  }
}
