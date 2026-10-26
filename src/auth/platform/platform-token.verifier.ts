import { createPublicKey, KeyObject } from 'node:crypto';
import { createRemoteJWKSet, JWTPayload, JWTVerifyGetKey, jwtVerify } from 'jose';

export const PLATFORM_TOKEN_VERIFIER = 'PLATFORM_TOKEN_VERIFIER';

/** The `aud` value the platform puts on tokens meant for the ERP. */
export const PLATFORM_AUDIENCE = 'erp';

/**
 * Verifies RS256 access tokens issued by eddva_platform against its public JWKS.
 * Signature, issuer, audience and expiry are all enforced here; the ERP then maps
 * the verified `sub` to a local user exactly like any other token (see JwtStrategy).
 */
export class PlatformTokenVerifier {
  constructor(
    readonly issuer: string,
    private readonly getKey: JWTVerifyGetKey,
  ) {}

  /**
   * Platform auth is opt-in: with neither variable set it is off and only the
   * legacy HS256 tokens are accepted. Setting just one is a misconfiguration.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): PlatformTokenVerifier | null {
    const jwksUrl = env.PLATFORM_JWKS_URL;
    const issuer = env.PLATFORM_ISSUER;
    if (!jwksUrl && !issuer) return null;
    if (!jwksUrl || !issuer) {
      throw new Error('PLATFORM_JWKS_URL and PLATFORM_ISSUER must be set together');
    }
    return new PlatformTokenVerifier(
      issuer,
      createRemoteJWKSet(new URL(jwksUrl), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
        timeoutDuration: 5_000,
      }),
    );
  }

  /** Throws if the token is not a valid, unexpired platform token for the ERP. */
  async verify(token: string): Promise<{ payload: JWTPayload; publicKeyPem: string }> {
    const { payload, key } = await jwtVerify(token, this.getKey, {
      issuer: this.issuer,
      audience: PLATFORM_AUDIENCE,
      algorithms: ['RS256'],
    });
    // passport-jwt verifies once more with the key we hand back, so give it the PEM.
    // JWKS lookups yield a public key already; createPublicKey only accepts private ones.
    const keyObject = key as KeyObject;
    const publicKey = keyObject.type === 'private' ? createPublicKey(keyObject) : keyObject;
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    return { payload, publicKeyPem };
  }
}
