/**
 * Single source of truth for "which EDDVA role names mean Institute Admin"
 * for the Canteen module. Lives in its own file (rather than alongside
 * `isCanteenAdmin` in canteen-access.service.ts, which imports
 * `CanteenPlatformUser` from canteen-auth.service.ts) so that
 * canteen-auth.service.ts can import it too without a circular dependency
 * between the two.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
