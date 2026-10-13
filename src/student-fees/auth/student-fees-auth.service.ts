import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../common/institute-admin-role-names';

export interface FeePlatformUser {
  eddva_user_id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string;
  is_institute_admin: boolean;
}

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

interface FeeTokenClaims {
  eddva_user_id?: unknown;
  institute_id?: unknown;
  user_role?: unknown;
  user_email?: unknown;
  user_name?: unknown;
  is_institute_admin?: unknown;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * StudentFeesAuthService — SSO-only (v1 scope: no dynamic RBAC, no direct
 * login — every endpoint requires the institute admin). Mirrors every other
 * module's auth island (own JWT secret, own session log, nothing read from
 * core tables), just trimmed to the admin-only case since this module is
 * new and doesn't yet need per-role permission granularity.
 */
@Injectable()
export class StudentFeesAuthService {
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

  private get feeJwtSecret(): string {
    const secret = process.env.STUDENT_FEES_JWT_SECRET;
    if (!secret) {
      throw new Error('STUDENT_FEES_JWT_SECRET must be set (it must differ from JWT_SECRET)');
    }
    return secret;
  }

  private isAdminRole(role: string): boolean {
    return (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(role);
  }

  async exchangeSsoToken(eddvaToken: string): Promise<{ fee_token: string; user: FeePlatformUser; redirect: string }> {
    const decoded = this.verifyErpToken(eddvaToken);

    const eddva_user_id = decoded.id || decoded.sub;
    const user_role = (decoded.role || '').toUpperCase();
    const institute_id = decoded.instituteId || decoded.institute_id || decoded.tenantId || '';
    const user_email = decoded.email;
    const user_name = decoded.name || decoded.fullName || decoded.userName || (user_email ? user_email.split('@')[0] : 'Institute Admin');

    if (!eddva_user_id || !institute_id) {
      throw new UnauthorizedException('Token missing required fields (user id or institute id)');
    }
    if (!this.isAdminRole(user_role)) {
      throw new UnauthorizedException('Only an institute admin can access Student Fees (v1 has no per-role permissions yet)');
    }

    const platformUser: FeePlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: true,
    };

    const fee_token = jwt.sign({ ...platformUser }, this.feeJwtSecret, { expiresIn: TOKEN_TTL_SECONDS });

    try {
      await this.prisma.feeSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          token_hash: createHash('sha256').update(fee_token).digest('hex'),
          expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
        },
      });
    } catch (err) {
      console.error('Failed to log Student Fees SSO session:', err);
    }

    return { fee_token, user: platformUser, redirect: '/student-fees' };
  }

  verifyFeeToken(token: string): FeePlatformUser {
    const secret = this.feeJwtSecret;
    try {
      const decoded = jwt.verify(token, secret) as FeeTokenClaims;
      const eddva_user_id = decoded.eddva_user_id;
      const institute_id = decoded.institute_id;
      const user_role = typeof decoded.user_role === 'string' ? decoded.user_role.toUpperCase() : '';

      if (typeof eddva_user_id !== 'string' || typeof institute_id !== 'string') {
        throw new UnauthorizedException('Student Fees session is missing required user details');
      }

      const user_email = typeof decoded.user_email === 'string' ? decoded.user_email : undefined;
      const user_name = typeof decoded.user_name === 'string' ? decoded.user_name : user_email?.split('@')[0] || 'Institute Admin';

      return {
        eddva_user_id,
        institute_id,
        user_name,
        user_email,
        user_role,
        is_institute_admin: decoded.is_institute_admin === true || this.isAdminRole(user_role),
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Student Fees session');
    }
  }
}
