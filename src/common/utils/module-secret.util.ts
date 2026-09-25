/**
 * Env-driven secrets for authentication. None of these have a literal or
 * derived fallback: a committed default lets anyone mint tokens the service
 * accepts, so a missing value fails closed.
 */

/** Every module that signs its own platform JWT after SSO exchange. */
export const MODULE_JWT_SECRET_ENV_NAMES = [
  'ACCOUNTS_JWT_SECRET',
  'ADMISSION_JWT_SECRET',
  'ALUMNI_JWT_SECRET',
  'CANTEEN_JWT_SECRET',
  'FRONT_OFFICE_JWT_SECRET',
  'HOSTEL_JWT_SECRET',
  'INVENTORY_JWT_SECRET',
  'LIBRARY_JWT_SECRET',
  'SALES_PURCHASE_JWT_SECRET',
  'SPORTS_JWT_SECRET',
  'TRANSPORT_JWT_SECRET',
];

/** Secrets the core ERP guard needs before it can verify any token. */
export const CORE_REQUIRED_ENV_NAMES = ['JWT_SECRET', 'SCHOOL_JWT_SECRET'];

export function requireEnv(envName: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`${envName} must be set`);
  }
  return value;
}

/**
 * Resolves a module's own JWT signing secret. Deliberately has NO fallback to
 * JWT_SECRET: a module secret that falls back to the shared ERP secret lets a
 * bare core token pass the module guard without going through SSO exchange. A
 * secret equal to a core secret is rejected for the same reason.
 */
export function requireModuleSecret(envName: string): string {
  const secret = process.env[envName];
  if (!secret) {
    throw new Error(`${envName} must be set (it must differ from JWT_SECRET)`);
  }
  if (secret === process.env.JWT_SECRET || secret === process.env.SCHOOL_JWT_SECRET) {
    throw new Error(`${envName} must differ from JWT_SECRET and SCHOOL_JWT_SECRET`);
  }
  return secret;
}

/**
 * Startup check, names only (never values). Core secrets are always fatal;
 * module secrets are fatal in production and reported as warnings otherwise, so
 * a developer can run one module without configuring all eleven.
 */
export function checkAuthEnv(env: NodeJS.ProcessEnv = process.env): { fatal: string[]; warnings: string[] } {
  const fatal = CORE_REQUIRED_ENV_NAMES.filter((name) => !env[name]).map((name) => `${name} is not set`);
  const moduleProblems = MODULE_JWT_SECRET_ENV_NAMES.flatMap((name) => {
    if (!env[name]) return [`${name} is not set`];
    if (env[name] === env.JWT_SECRET || env[name] === env.SCHOOL_JWT_SECRET) {
      return [`${name} must differ from JWT_SECRET and SCHOOL_JWT_SECRET`];
    }
    return [];
  });
  if (env.NODE_ENV === 'production') {
    return { fatal: [...fatal, ...moduleProblems], warnings: [] };
  }
  return { fatal, warnings: moduleProblems };
}
