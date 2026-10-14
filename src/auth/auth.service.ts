import { Injectable, UnauthorizedException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

// LMS roles permitted to open ERP via SSO, mapped to the ERP role name a
// shadow account gets auto-provisioned with on first login. Students/parents
// (and the platform-wide SUPER_ADMIN, which has no single institute) are
// deliberately absent — there is no legitimate case for them to enter ERP.
const SSO_ROLE_MAP: Record<string, string> = {
  INSTITUTE_ADMIN: 'INSTITUTE_ADMIN',
  TEACHER: 'TEACHER',
  STAFF: 'STAFF',
};

// Every module except Library has its own "auth island" — a dynamic-role
// table keyed by this core user's id (eddva_user_id), separate from the core
// Role/Permission system. That's the real, per-module access grant (not the
// person's HR department, which is a different, looser label) — so it's
// what decides where an SSO'd-in user actually lands. Library has no such
// table (no per-module staff accounts of its own yet), so it's left out —
// it never matches, which is the correct behaviour until it gets one.
const MODULE_ROLE_TABLES: Record<string, string> = {
  accounts: 'accountsUserDynamicRole',
  canteen: 'canteenUserDynamicRole',
  sports: 'sportsUserDynamicRole',
  'front-office': 'frontOfficeUserDynamicRole',
  inventory: 'inventoryUserDynamicRole',
  transport: 'transportUserDynamicRole',
  'sales-purchase': 'salesPurchaseUserDynamicRole',
  admission: 'admissionUserDynamicRole',
  hostel: 'hostelUserDynamicRole',
  alumni: 'alumniUserDynamicRole',
  staff: 'staffUserDynamicRole',
};

type UserWithRole = Awaited<ReturnType<AuthService['findUserWithRole']>>;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private buildUserAccess(roleName: string, permissions: string[]) {
    const application = 'INSTITUTE_ADMIN';
    return {
      application,
      access: {
        application,
        role: roleName,
        permissions,
      },
    };
  }

  private findUserWithRole(where: { email: string } | { id: string }) {
    return this.prisma.user.findUnique({
      where: where as any,
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Shared by password login and SSO login once each has done its own
   * active-account/active-role checks (with whatever error message fits that
   * call site) — this just merges permissions and signs the token, so both
   * callers return the exact same shape.
   */
  private async buildAuthResponse(user: NonNullable<UserWithRole>) {
    let permissions = user.role.rolePermissions.map(
      (rp) => rp.permission.permissionKey,
    );

    const rNameUpper = (user.role.roleName || '').toUpperCase();
    if (
      rNameUpper === 'INSTITUTE ADMINISTRATOR' ||
      rNameUpper === 'SUPER_ADMIN' ||
      rNameUpper === 'INSTITUTE_ADMIN'
    ) {
      const allSys = await this.prisma.permission.findMany({ select: { permissionKey: true } });
      permissions = Array.from(new Set([...permissions, ...allSys.map((p) => p.permissionKey)]));
    }

    const userAccess = this.buildUserAccess(user.role.roleName, permissions);

    const token = this.jwtService.sign({
      id: user.id,
      sub: user.id,
      role: user.role.roleName,
      email: user.email,
      instituteId: user.instituteId || null,
      application: userAccess.application,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        instituteId: user.instituteId || null,
        roleId: user.roleId,
        roleName: user.role.roleName,
        application: userAccess.application,
        access: userAccess.access,
        permissions,
      },
    };
  }

  /**
   * Verifies an LMS-issued SSO bridge token (signed with SCHOOL_JWT_SECRET,
   * minted by the LMS's `POST /school/auth/erp-sso-token`) and returns a
   * normal ERP session — same shape as `login()`. On first use for a given
   * email, auto-provisions a shadow User + Role in this institute, mapped
   * from the LMS role; every call after that just signs in as that user.
   *
   * Identity still comes from the database afterwards, same as JwtStrategy's
   * own rule — this method's only job is to make sure that database row
   * exists before handing back a token, since the core guard refuses to
   * provision one on the fly.
   */
  async ssoLogin(ssoToken: string) {
    const secret = process.env.SCHOOL_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('SSO is not configured');
    }

    let payload: any;
    try {
      payload = jwt.verify(ssoToken, secret, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired SSO token');
    }

    if (payload.purpose !== 'erp-sso') {
      throw new UnauthorizedException('Invalid SSO token');
    }

    const instituteId: string | undefined = payload.instituteId;
    if (!instituteId) {
      throw new ForbiddenException('No institute context in SSO token');
    }

    const erpRoleName = SSO_ROLE_MAP[String(payload.role || '').toUpperCase()];
    if (!erpRoleName) {
      throw new ForbiddenException(`Role '${payload.role}' is not permitted to access ERP`);
    }

    const email: string | undefined = payload.email;
    if (!email) {
      throw new UnauthorizedException('SSO token missing email');
    }

    let user = await this.findUserWithRole({ email });

    if (user && user.instituteId !== instituteId) {
      throw new ConflictException('This email is already linked to a different institute in ERP.');
    }

    if (!user) {
      let role = await this.prisma.role.findUnique({
        where: { roleName_instituteId: { roleName: erpRoleName, instituteId } },
      });
      if (!role) {
        role = await this.prisma.role.create({
          data: { instituteId, roleName: erpRoleName, status: 'ACTIVE' },
        });
      }

      // This account only ever authenticates via SSO — the password is never
      // communicated and never meant to be used for a direct ERP login.
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      await this.prisma.user.create({
        data: {
          instituteId,
          name: payload.name || email,
          email,
          passwordHash,
          roleId: role.id,
          status: 'ACTIVE',
        },
      });
      user = await this.findUserWithRole({ email });
    }

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account inactive or invalid.');
    }
    if (!user.role || user.role.status !== 'ACTIVE') {
      throw new UnauthorizedException('User role is inactive or invalid.');
    }

    const defaultModule = await this.resolveDefaultModule(user.id, instituteId);
    return { ...(await this.buildAuthResponse(user)), defaultModule };
  }

  /**
   * Which single ERP module, if any, this person should land in — based on
   * which module(s) they actually hold a role in today, not their HR
   * department (a looser, module-agnostic label). Exactly one match sends
   * them straight there; zero or multiple fall back to the central
   * dashboard, since there's no single obviously-right place to send them.
   */
  private async resolveDefaultModule(userId: string, instituteId: string): Promise<string | null> {
    const entries = Object.entries(MODULE_ROLE_TABLES);
    const hits = await Promise.all(
      entries.map(([, modelName]) =>
        (this.prisma as any)[modelName]
          .findFirst({ where: { eddva_user_id: userId, institute_id: instituteId, is_active: true }, select: { id: true } })
          .then((row: unknown) => !!row)
          .catch(() => false),
      ),
    );
    const matches = entries.filter((_, i) => hits[i]).map(([key]) => key);
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * The reverse of ssoLogin(): mints a short-lived bridge token (same
   * SCHOOL_JWT_SECRET channel) so an Institute Admin can jump from ERP back
   * into the LMS without re-authenticating. Admin-only — a teacher/staff
   * ERP session has no equivalent "switch back" (they may not even have an
   * LMS account at all), and the LMS side still requires an existing LMS
   * user for this email; it never auto-provisions one.
   */
  async mintLmsSsoToken(user: { email?: string; instituteId?: string; role?: string }) {
    if (user.role !== 'INSTITUTE_ADMIN') {
      throw new ForbiddenException('Only an institute admin can switch to the LMS');
    }
    if (!user.email || !user.instituteId) {
      throw new ForbiddenException('Missing email or institute context');
    }

    const secret = process.env.SCHOOL_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('SSO is not configured');
    }

    const token = jwt.sign(
      {
        email: user.email,
        instituteId: user.instituteId,
        purpose: 'lms-sso',
      },
      secret,
      { expiresIn: '2m' },
    );

    return { success: true, token };
  }

  async login(loginDto: LoginDto) {
    const user = await this.findUserWithRole({ email: loginDto.email });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.role || user.role.status !== 'ACTIVE') {
      throw new UnauthorizedException('User role is inactive or invalid.');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse(user);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    let permissions = user.role?.rolePermissions.map(
      (rp) => rp.permission.permissionKey,
    ) || [];

    const rNameUpper = (user.role?.roleName || '').toUpperCase();
    if (
      rNameUpper === 'INSTITUTE ADMINISTRATOR' ||
      rNameUpper === 'SUPER_ADMIN' ||
      rNameUpper === 'INSTITUTE_ADMIN'
    ) {
      const allSys = await this.prisma.permission.findMany({ select: { permissionKey: true } });
      permissions = Array.from(new Set([...permissions, ...allSys.map((p) => p.permissionKey)]));
    }

    const userAccess = this.buildUserAccess(user.role?.roleName || '', permissions);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      instituteId: user.instituteId || null,
      roleId: user.roleId,
      roleName: user.role?.roleName || '',
      status: user.status,
      application: userAccess.application,
      access: userAccess.access,
      permissions,
    };
  }
}
