import { checkAuthEnv, MODULE_JWT_SECRET_ENV_NAMES, requireEnv, requireModuleSecret } from './module-secret.util';

describe('module secret helpers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('requireModuleSecret', () => {
    it('fails closed when the module secret is unset, even if JWT_SECRET is set', () => {
      delete process.env.LIBRARY_JWT_SECRET;
      process.env.JWT_SECRET = 'core';
      expect(() => requireModuleSecret('LIBRARY_JWT_SECRET')).toThrow('LIBRARY_JWT_SECRET must be set');
    });

    it('rejects a module secret equal to a core secret', () => {
      process.env.JWT_SECRET = 'same';
      process.env.LIBRARY_JWT_SECRET = 'same';
      expect(() => requireModuleSecret('LIBRARY_JWT_SECRET')).toThrow('must differ');
      delete process.env.JWT_SECRET;
      process.env.SCHOOL_JWT_SECRET = 'same';
      expect(() => requireModuleSecret('LIBRARY_JWT_SECRET')).toThrow('must differ');
    });

    it('returns a distinct configured secret', () => {
      process.env.JWT_SECRET = 'core';
      process.env.LIBRARY_JWT_SECRET = 'library-own';
      expect(requireModuleSecret('LIBRARY_JWT_SECRET')).toBe('library-own');
    });
  });

  describe('requireEnv', () => {
    it('throws when unset and returns the value when set', () => {
      delete process.env.JWT_SECRET;
      expect(() => requireEnv('JWT_SECRET')).toThrow('JWT_SECRET must be set');
      process.env.JWT_SECRET = 'x';
      expect(requireEnv('JWT_SECRET')).toBe('x');
    });
  });

  describe('checkAuthEnv', () => {
    const allModules = () => Object.fromEntries(MODULE_JWT_SECRET_ENV_NAMES.map((n) => [n, `own-${n}`]));

    it('is clean when everything is configured', () => {
      expect(checkAuthEnv({ JWT_SECRET: 'a', SCHOOL_JWT_SECRET: 'b', ...allModules() } as any)).toEqual({ fatal: [], warnings: [] });
    });

    it('always treats missing core secrets as fatal', () => {
      const r = checkAuthEnv({ ...allModules() } as any);
      expect(r.fatal).toEqual(['JWT_SECRET is not set', 'SCHOOL_JWT_SECRET is not set']);
    });

    it('downgrades missing module secrets to warnings outside production', () => {
      const r = checkAuthEnv({ JWT_SECRET: 'a', SCHOOL_JWT_SECRET: 'b' } as any);
      expect(r.fatal).toEqual([]);
      expect(r.warnings).toHaveLength(MODULE_JWT_SECRET_ENV_NAMES.length);
    });

    it('makes missing or shared module secrets fatal in production', () => {
      const r = checkAuthEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a',
        SCHOOL_JWT_SECRET: 'b',
        ...allModules(),
        LIBRARY_JWT_SECRET: 'a',
        SPORTS_JWT_SECRET: '',
      } as any);
      expect(r.warnings).toEqual([]);
      expect(r.fatal).toEqual([
        'LIBRARY_JWT_SECRET must differ from JWT_SECRET and SCHOOL_JWT_SECRET',
        'SPORTS_JWT_SECRET is not set',
      ]);
    });

    it('never puts a secret value in its messages', () => {
      const r = checkAuthEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'super-secret-value',
        SCHOOL_JWT_SECRET: 'b',
        LIBRARY_JWT_SECRET: 'super-secret-value',
      } as any);
      expect(JSON.stringify(r)).not.toContain('super-secret-value');
    });
  });
});
