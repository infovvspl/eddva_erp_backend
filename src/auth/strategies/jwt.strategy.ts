import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwt from 'jsonwebtoken';
import { decodeProtectedHeader } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_TOKEN_VERIFIER, PlatformTokenVerifier } from '../platform/platform-token.verifier';

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

// Legacy tokens (ERP login, LMS SSO) are HS256 only; RS256 is reserved for platform tokens.
const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];
const REJECT = () => new UnauthorizedException('Invalid or expired token');

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
  private readonly platformIssuer: string | null;

  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(PLATFORM_TOKEN_VERIFIER) platformVerifier?: PlatformTokenVerifier | null,
  ) {
    const platform = platformVerifier ?? PlatformTokenVerifier.fromEnv();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: platform ? [...JWT_ALGORITHMS, 'RS256'] : JWT_ALGORITHMS,
      secretOrKeyProvider: JwtStrategy.buildSecretProvider(resolveCoreJwtSecrets(), platform),
    });
    this.platformIssuer = platform?.issuer ?? null;
  }

  /**
   * Picks the verification path from the token's own algorithm, never the other way round:
   * RS256 is only ever checked against the platform JWKS and HS256 only against the shared
   * secrets, so neither kind of key can be used to validate the other.
   */
  private static buildSecretProvider(secrets: string[], platform: PlatformTokenVerifier | null) {
    return (
      _request: unknown,
      rawJwtToken: string,
      done: (err: any, secret?: string) => void,
    ) => {
      let alg: string | undefined;
      try {
        alg = decodeProtectedHeader(rawJwtToken).alg;
      } catch {
        return done(REJECT());
      }

      if (alg === 'RS256') {
        if (!platform) return done(REJECT());
        platform.verify(rawJwtToken).then(
          ({ publicKeyPem }) => done(null, publicKeyPem),
          () => done(REJECT()),
        );
        return;
      }

      // A shared-secret token must not be able to pose as a platform token.
      if (platform && (jwt.decode(rawJwtToken) as jwt.JwtPayload | null)?.iss === platform.issuer) {
        return done(REJECT());
      }

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
      return done(REJECT());
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

    // A platform token's `sub` is the platform user id, which only maps to an ERP user through an
    // explicit link (see PlatformLinkController). It is never matched on email or tenant claims.
    const isPlatformToken = this.platformIssuer !== null && payload.iss === this.platformIssuer;
    const user = await this.prisma.user.findUnique({
      where: isPlatformToken ? { platformUserId: userId } : { id: userId },
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
