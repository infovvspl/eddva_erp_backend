import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { requireModuleSecret } from '../../common/utils/module-secret.util';
import { INSTITUTE_ADMIN_ROLE_NAMES } from '../common/institute-admin-role-names';

export interface StaffPlatformUser {
  eddva_user_id: string;
  institute_id: string;
  user_name: string;
  user_email?: string;
  user_role: string;
  is_institute_admin: boolean;
  role_id?: number;
  role_name?: string;
  permissions?: unknown;
  /** Set only for a teacher's own self-service session — the StaffMember row they're allowed to act as. Never set for admin/dynamic-role sessions. */
  self_staff_id?: number;
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

/** Claims of a Staff JWT — untrusted until each field is type-checked. */
interface StaffTokenClaims {
  eddva_user_id?: unknown;
  institute_id?: unknown;
  user_role?: unknown;
  user_email?: unknown;
  user_name?: unknown;
  is_institute_admin?: unknown;
  role_id?: unknown;
  role_name?: unknown;
  self_staff_id?: unknown;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * StaffAuthService — SSO token validation and Staff JWT issuance. Mirrors
 * HostelAuthService: an independent auth space for staff-module users (HR
 * Officer/Principal/Department Head/etc.), who may or may not exist as core
 * `users` rows. Nothing here reads core tables.
 */
@Injectable()
export class StaffAuthService {
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

  private get staffJwtSecret(): string {
    return requireModuleSecret('STAFF_JWT_SECRET');
  }

  private isAdminRole(role: string): boolean {
    return (INSTITUTE_ADMIN_ROLE_NAMES as readonly string[]).includes(role);
  }

  /** Validate an EDDVA Institute Admin token and exchange it for a Staff JWT. */
  async exchangeSsoToken(eddvaToken: string): Promise<{
    staff_token: string;
    user: StaffPlatformUser;
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

    const platformUser: StaffPlatformUser = {
      eddva_user_id,
      institute_id,
      user_name,
      user_email,
      user_role,
      is_institute_admin: this.isAdminRole(user_role),
    };

    const staff_token = jwt.sign({ ...platformUser }, this.staffJwtSecret, {
      expiresIn: TOKEN_TTL_SECONDS,
    });

    try {
      await this.prisma.staffSsoSession.create({
        data: {
          institute_id,
          eddva_user_id,
          user_name,
          user_email,
          user_role,
          token_hash: createHash('sha256').update(staff_token).digest('hex'),
          expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
        },
      });
    } catch (err) {
      console.error('Failed to log Staff SSO session:', err);
    }

    return {
      staff_token,
      user: platformUser,
      redirect: '/staff/permissions',
    };
  }

  private lmsConfig() {
    const baseUrl = process.env.LMS_BASE_URL?.replace(/\/+$/, '');
    const key = process.env.INTERNAL_API_KEY;
    const instituteId = process.env.LMS_INSTITUTE_ID?.trim();
    return baseUrl && key ? { baseUrl, key, instituteId } : null;
  }

  /**
   * Validate an LMS teacher's own JWT and exchange it for a scoped Staff JWT
   * tied to their own StaffMember row. Unlike `exchangeSsoToken` (institute
   * admins only), this never grants dynamic-RBAC permissions — the resulting
   * session can only touch the self-service `/api/staff/me/*` endpoints,
   * enforced by `self_staff_id` rather than a permission grant.
   */
  async exchangeTeacherSsoToken(lmsToken: string): Promise<{
    staff_token: string;
    user: StaffPlatformUser;
  }> {
    const decoded = this.verifyErpToken(lmsToken);
    const lms_user_id = decoded.sub || decoded.id;
    const role = (decoded.role || '').toUpperCase();
    const institute_id = decoded.instituteId || decoded.institute_id || decoded.tenantId || '';

    if (!lms_user_id || !institute_id) {
      throw new UnauthorizedException('Token missing required fields (user id or institute id)');
    }
    // LMS roles can be comma-joined for multi-role accounts (e.g. "TEACHER,INSTITUTE_ADMIN"),
    // same convention the LMS itself uses to match roles — so this must check
    // membership, not equality.
    if (!role.split(',').includes('TEACHER')) {
      throw new UnauthorizedException('Only a teacher login can be exchanged for a self-service staff session');
    }

    const cfg = this.lmsConfig();
    if (!cfg) {
      throw new Error('LMS_BASE_URL / INTERNAL_API_KEY not configured');
    }

    const res = await fetch(
      `${cfg.baseUrl}/internal/erp/teachers/resolve?instituteId=${encodeURIComponent(cfg.instituteId || institute_id)}&userId=${encodeURIComponent(lms_user_id)}`,
      { headers: { 'x-internal-key': cfg.key }, signal: AbortSignal.timeout(15_000) },
    );
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        throw new UnauthorizedException('No teacher profile found in the LMS for this login');
      }
      const detail = body?.message?.message ?? body?.message ?? res.statusText;
      throw new UnauthorizedException(`LMS ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    const { teacherId, employeeId, name, email } = body.data ?? body;

    const staff = await this.prisma.staffMember.findFirst({
      where: {
        institute_id,
        OR: [
          ...(teacherId ? [{ lms_teacher_ref: teacherId }] : []),
          ...(employeeId ? [{ staff_code: employeeId }] : []),
        ],
      },
    });
    if (!staff) {
      throw new UnauthorizedException(
        'No staff record is linked to your LMS teacher profile yet. Ask your institute admin to import you into the Staff Directory first.',
      );
    }

    if (staff.lms_user_id !== String(lms_user_id)) {
      // Self-heals: lets payroll/other notifications target this teacher
      // directly instead of broadcasting, without a separate backfill step.
      await this.prisma.staffMember
        .update({ where: { staff_id: staff.staff_id }, data: { lms_user_id: String(lms_user_id) } })
        .catch(() => undefined);
    }

    const platformUser: StaffPlatformUser = {
      eddva_user_id: String(lms_user_id),
      institute_id,
      user_name: name || staff.full_name,
      user_email: email || staff.email || undefined,
      user_role: 'TEACHER_SELF_SERVICE',
      is_institute_admin: false,
      self_staff_id: staff.staff_id,
    };

    const staff_token = jwt.sign({ ...platformUser }, this.staffJwtSecret, {
      expiresIn: TOKEN_TTL_SECONDS,
    });

    return { staff_token, user: platformUser };
  }

  /** Direct login for assigned role users (HR Officer, Department Head, etc.). */
  async directLogin(
    usernameOrEmail: string,
    rawPassword: string,
    instituteId?: string,
  ): Promise<{
    staff_token: string;
    user: StaffPlatformUser & { role_name: string; permissions: unknown };
  }> {
    // (institute_id, username) is the unique key, so the same username can exist
    // in two institutes. Refuse to guess between them.
    const matches = await this.prisma.staffUserDynamicRole.findMany({
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

    const platformUser: StaffPlatformUser = {
      eddva_user_id: assignment.eddva_user_id,
      institute_id: assignment.institute_id,
      user_name: assignment.user_name,
      user_email: assignment.user_email ?? undefined,
      user_role: assignment.role.name,
      is_institute_admin: false,
    };

    const staff_token = jwt.sign(
      {
        ...platformUser,
        role_id: assignment.role_id,
        role_name: assignment.role.name,
      },
      this.staffJwtSecret,
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    return {
      staff_token,
      user: {
        ...platformUser,
        role_name: assignment.role.name,
        permissions: assignment.role.permissions,
      },
    };
  }

  /**
   * Verify a Staff JWT (used by StaffJwtGuard). Defensively validates
   * the payload shape so a malformed token fails with 401 rather than crashing
   * a downstream Prisma call with undefined fields.
   */
  verifyStaffToken(token: string): StaffPlatformUser {
    const secret = this.staffJwtSecret;
    try {
      const decoded = jwt.verify(token, secret) as StaffTokenClaims;
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
          'Staff session is missing required user details',
        );
      }

      const user_email =
        typeof decoded.user_email === 'string' ? decoded.user_email : undefined;
      const user_name =
        typeof decoded.user_name === 'string'
          ? decoded.user_name
          : user_email?.split('@')[0] || 'Staff User';

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
        self_staff_id:
          typeof decoded.self_staff_id === 'number' ? decoded.self_staff_id : undefined,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired Staff session');
    }
  }
}
