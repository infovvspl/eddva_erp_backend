import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtStrategy, resolveCoreJwtSecrets } from './jwt.strategy';

const ENV_KEYS = ['SCHOOL_JWT_SECRET', 'JWT_SECRET'] as const;

describe('resolveCoreJwtSecrets', () => {
  it('fails closed when a core secret is missing', () => {
    expect(() => resolveCoreJwtSecrets({ JWT_SECRET: 'a' } as any)).toThrow('SCHOOL_JWT_SECRET must be set');
    expect(() => resolveCoreJwtSecrets({} as any)).toThrow('SCHOOL_JWT_SECRET and JWT_SECRET must be set');
  });

  it('returns only the configured secrets, with no literal or derived fallbacks', () => {
    expect(resolveCoreJwtSecrets({ SCHOOL_JWT_SECRET: 'school-s', JWT_SECRET: 'erp-s' } as any)).toEqual(['school-s', 'erp-s']);
  });
});

describe('JwtStrategy', () => {
  const saved: Record<string, string | undefined> = {};
  const mockPrisma = {
    user: { findUnique: jest.fn(), upsert: jest.fn() },
    role: { findFirst: jest.fn() },
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    ENV_KEYS.forEach((k) => (saved[k] = process.env[k]));
    process.env.SCHOOL_JWT_SECRET = 'test-school-secret';
    process.env.JWT_SECRET = 'test-erp-secret';
    jest.clearAllMocks();
    strategy = new JwtStrategy(mockPrisma as any);
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  });

  it('refuses to construct without the core secrets', () => {
    delete process.env.SCHOOL_JWT_SECRET;
    expect(() => new JwtStrategy(mockPrisma as any)).toThrow('SCHOOL_JWT_SECRET must be set');
  });

  describe('secret selection', () => {
    const pick = (token: string) =>
      new Promise<{ err: any; secret?: string }>((resolve) => {
        (strategy as any)._secretOrKeyProvider({}, token, (err: any, secret?: string) => resolve({ err, secret }));
      });

    it('accepts tokens signed with either configured secret', async () => {
      const a = await pick(jwt.sign({ id: 'u' }, 'test-school-secret'));
      const b = await pick(jwt.sign({ id: 'u' }, 'test-erp-secret'));
      expect(a).toEqual({ err: null, secret: 'test-school-secret' });
      expect(b).toEqual({ err: null, secret: 'test-erp-secret' });
    });

    it.each([
      'eddva_erp_super_secret_jwt_key_2026',
      'your-super-secret-jwt-key-change-in-production',
      'school:your-super-secret-jwt-key-change-in-production',
      'dev_school_secret_change_in_prod',
      'school:test-erp-secret',
    ])('rejects a token forged with the old fallback secret %s', async (forgedWith) => {
      const { err, secret } = await pick(jwt.sign({ id: 'u' }, forgedWith));
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(secret).toBeUndefined();
    });

    it('rejects tokens that use a non-HS256 algorithm', async () => {
      const { err } = await pick(jwt.sign({ id: 'u' }, 'test-erp-secret', { algorithm: 'HS512' }));
      expect(err).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('validate', () => {
    const activeUser = {
      id: 'user-1',
      email: 'db@school.test',
      name: 'DB Name',
      instituteId: 'inst-db',
      roleId: 'role-1',
      status: 'ACTIVE',
      role: {
        roleName: 'ACCOUNTANT',
        status: 'ACTIVE',
        rolePermissions: [{ permission: { permissionKey: 'invoice.read' } }],
      },
    };

    it('takes role, institute and permissions from the database, not the token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await strategy.validate({
        id: 'user-1',
        role: 'INSTITUTE_ADMIN',
        instituteId: 'inst-attacker',
        email: 'forged@x.test',
      });

      expect(result).toMatchObject({
        id: 'user-1',
        email: 'db@school.test',
        role: 'ACCOUNTANT',
        roleName: 'ACCOUNTANT',
        instituteId: 'inst-db',
        permissions: ['invoice.read'],
      });
    });

    it('rejects a token whose user has no ERP account, without provisioning one', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate({ id: 'ghost', email: 'ghost@x.test', role: 'INSTITUTE_ADMIN' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
    });

    it('does not fall back to an email lookup when the id is unknown', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(strategy.validate({ id: 'other-id', email: 'db@school.test' })).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-id' } }));
    });

    it('rejects an inactive user or an inactive role', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...activeUser, status: 'INACTIVE' });
      await expect(strategy.validate({ id: 'user-1' })).rejects.toThrow(UnauthorizedException);

      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...activeUser, role: { ...activeUser.role, status: 'INACTIVE' } });
      await expect(strategy.validate({ id: 'user-1' })).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a payload without a user id', async () => {
      await expect(strategy.validate({ email: 'x@y.test' })).rejects.toThrow(UnauthorizedException);
    });
  });
});
