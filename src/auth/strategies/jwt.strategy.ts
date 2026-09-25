import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  id?: string;
  sub?: string;
  email?: string;
  role?: string;
  tenantType?: string;
  instituteId?: string;
  sessionId?: string;
  name?: string;
  [key: string]: any;
}

const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

/**
 * Secrets the core ERP guard accepts: the LMS-issued SSO secret and this
 * service's own login secret. Both come from the environment only. There are
 * deliberately no literal or derived fallbacks: a committed default lets anyone
 * mint a token the guard accepts, so a missing secret fails closed.
 */
export function resolveCoreJwtSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing = ['SCHOOL_JWT_SECRET', 'JWT_SECRET'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`${missing.join(' and ')} must be set`);
  }
  return [...new Set([env.SCHOOL_JWT_SECRET as string, env.JWT_SECRET as string])];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: JWT_ALGORITHMS,
      secretOrKeyProvider: JwtStrategy.buildSecretProvider(resolveCoreJwtSecrets()),
    });
  }

  private static buildSecretProvider(secrets: string[]) {
    return (
      _request: unknown,
      rawJwtToken: string,
      done: (err: any, secret?: string) => void,
    ) => {
      for (const secret of secrets) {
        try {
          jwt.verify(rawJwtToken, secret, { algorithms: JWT_ALGORITHMS });
          return done(null, secret);
        } catch {
          // Try the next configured secret.
        }
      }
      // No configured secret verifies this token: reject it outright rather
      // than handing passport a key to fail against.
      return done(new UnauthorizedException('Invalid or expired token'));
    };
  }

  /**
   * Identity, role, permissions and institute all come from the database row,
   * never from token claims: a token proves who the caller is, not what they
   * may do. A token whose user has no ERP account is rejected — there is no
   * on-the-fly provisioning and no email-based lookup.
   */
  async validate(payload: JwtPayload) {
    const userId = payload.id ?? payload.sub;

    if (!userId) {
      throw new UnauthorizedException('Invalid token payload: missing user ID.');
    }

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

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account inactive or invalid.');
    }

    if (!user.role || user.role.status !== 'ACTIVE') {
      throw new UnauthorizedException('User role is inactive or invalid.');
    }

    const permissions = user.role.rolePermissions.map(
      (rp) => rp.permission.permissionKey,
    );

    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role.roleName,
      roleId: user.roleId,
      roleName: user.role.roleName,
      permissions,
      tenantType: payload.tenantType || null,
      instituteId: user.instituteId ?? null,
      sessionId: payload.sessionId || null,
    };
  }
}
