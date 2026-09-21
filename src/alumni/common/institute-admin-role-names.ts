/**
 * Single source of truth for "which EDDVA role names mean Institute Admin"
 * for the Alumni module. Lives in its own file (rather than alongside
 * `isAlumniAdmin` in alumni-access.service.ts, which imports
 * `AlumniPlatformUser` from alumni-auth.service.ts) so that
 * alumni-auth.service.ts can import it too without a circular dependency.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
