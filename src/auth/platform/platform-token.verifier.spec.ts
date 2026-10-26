import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import * as jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { PlatformTokenVerifier } from './platform-token.verifier';

const ISSUER = 'https://platform.test';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const verifier = new PlatformTokenVerifier(ISSUER, createLocalJWKSet({ keys: [jwk] }));

  const sign = (
    claims: Record<string, unknown> = {},
    opts: { aud?: string | string[]; iss?: string; exp?: string; key?: typeof privateKey; kid?: string } = {},
  ) =>
    new SignJWT({ roles: ['institute_admin'], ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
      .setSubject('platform-user-1')
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? ['lms', 'erp'])
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(opts.key ?? privateKey);

  return { verifier, sign, otherKey: other.privateKey };
}

describe('PlatformTokenVerifier', () => {
  it('is off unless both env vars are set, and refuses a half configuration', () => {
    expect(PlatformTokenVerifier.fromEnv({} as any)).toBeNull();
    expect(() => PlatformTokenVerifier.fromEnv({ PLATFORM_ISSUER: ISSUER } as any)).toThrow('must be set together');
    expect(() => PlatformTokenVerifier.fromEnv({ PLATFORM_JWKS_URL: 'http://x/jwks' } as any)).toThrow('must be set together');
    expect(
      PlatformTokenVerifier.fromEnv({ PLATFORM_ISSUER: ISSUER, PLATFORM_JWKS_URL: 'http://x/jwks' } as any)?.issuer,
    ).toBe(ISSUER);
  });

  it('accepts a valid token for the erp audience', async () => {
    const { verifier, sign } = await setup();
    const { payload, publicKeyPem } = await verifier.verify(await sign());
    expect(payload.sub).toBe('platform-user-1');
    expect(publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it.each([
    ['a token not meant for the erp', { aud: ['lms'] }],
    ['a different issuer', { iss: 'https://evil.test' }],
    ['an expired token', { exp: '-1m' }],
    ['an unknown key id', { kid: 'nope' }],
  ])('rejects %s', async (_name, opts) => {
    const { verifier, sign } = await setup();
    await expect(verifier.verify(await sign({}, opts))).rejects.toBeDefined();
  });

  it('rejects a token signed by someone else with a known kid', async () => {
    const { verifier, sign, otherKey } = await setup();
    await expect(verifier.verify(await sign({}, { key: otherKey }))).rejects.toBeDefined();
  });
});

describe('JwtStrategy with platform tokens', () => {
  const saved = { school: process.env.SCHOOL_JWT_SECRET, erp: process.env.JWT_SECRET };
  const prisma = { user: { findUnique: jest.fn() } };

  beforeAll(() => {
    process.env.SCHOOL_JWT_SECRET = 'test-school-secret';
    process.env.JWT_SECRET = 'test-erp-secret';
  });
  afterAll(() => {
    process.env.SCHOOL_JWT_SECRET = saved.school;
    process.env.JWT_SECRET = saved.erp;
  });
  beforeEach(() => jest.clearAllMocks());

  const pick = (strategy: JwtStrategy, token: string) =>
    new Promise<{ err: any; secret?: string }>((resolve) => {
      (strategy as any)._secretOrKeyProvider({}, token, (err: any, secret?: string) => resolve({ err, secret }));
    });

  const linkedUser = {
    id: 'erp-user-1',
    email: 'head@school.test',
    name: 'Head',
    instituteId: 'inst-1',
    roleId: 'r1',
    status: 'ACTIVE',
    role: { roleName: 'INSTITUTE ADMINISTRATOR', status: 'ACTIVE', rolePermissions: [{ permission: { permissionKey: 'x.read' } }] },
  };

  it('verifies a platform token and resolves the ERP user through the link, ignoring token claims', async () => {
    const { verifier, sign } = await setup();
    const strategy = new JwtStrategy(prisma as any, verifier);
    const token = await sign({ tenant_id: 'attacker-tenant', instituteId: 'inst-attacker' });

    const { err, secret } = await pick(strategy, token);
    expect(err).toBeNull();
    expect(secret).toContain('BEGIN PUBLIC KEY');

    prisma.user.findUnique.mockResolvedValue(linkedUser);
    const claims = jwt.decode(token) as any;
    const result = await strategy.validate(claims);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { platformUserId: 'platform-user-1' } }));
    expect(result).toMatchObject({ id: 'erp-user-1', instituteId: 'inst-1', permissions: ['x.read'] });
  });

  it('rejects a platform user who has no linked ERP account', async () => {
    const { verifier, sign } = await setup();
    const strategy = new JwtStrategy(prisma as any, verifier);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(jwt.decode(await sign()) as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects RS256 tokens when platform auth is not configured', async () => {
    const { sign } = await setup();
    const strategy = new JwtStrategy(prisma as any); // no verifier, no env
    const { err } = await pick(strategy, await sign());
    expect(err).toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a bad platform token (wrong audience)', async () => {
    const { verifier, sign } = await setup();
    const strategy = new JwtStrategy(prisma as any, verifier);
    const { err } = await pick(strategy, await sign({}, { aud: ['lms'] }));
    expect(err).toBeInstanceOf(UnauthorizedException);
  });

  it('does not let a shared-secret token pose as a platform token', async () => {
    const { verifier } = await setup();
    const strategy = new JwtStrategy(prisma as any, verifier);
    const forged = jwt.sign({ sub: 'platform-user-1', iss: ISSUER, aud: 'erp' }, 'test-school-secret');
    expect((await pick(strategy, forged)).err).toBeInstanceOf(UnauthorizedException);
  });

  it('still accepts legacy HS256 tokens and looks them up by ERP id', async () => {
    const { verifier } = await setup();
    const strategy = new JwtStrategy(prisma as any, verifier);
    const legacy = jwt.sign({ id: 'erp-user-1' }, 'test-erp-secret');
    expect((await pick(strategy, legacy)).secret).toBe('test-erp-secret');

    prisma.user.findUnique.mockResolvedValue(linkedUser);
    await strategy.validate({ id: 'erp-user-1' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'erp-user-1' } }));
  });

  it('rejects an HS256 token that is alg-confused against the platform public key', async () => {
    const { verifier, sign } = await setup();
    const strategy = new JwtStrategy(prisma as any, verifier);
    const { secret: pem } = await pick(strategy, await sign());
    const confused = jwt.sign({ sub: 'platform-user-1' }, pem as string, { algorithm: 'HS256' });
    expect((await pick(strategy, confused)).err).toBeInstanceOf(UnauthorizedException);
  });
});
