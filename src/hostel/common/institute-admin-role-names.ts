/**
 * Single source of truth for "which EDDVA role names mean Institute Admin"
 * for the Hostel module. Lives in its own file (rather than alongside
 * `isHostelAdmin` in hostel-access.service.ts, which imports
 * `HostelPlatformUser` from hostel-auth.service.ts) so that
 * hostel-auth.service.ts can import it too without a circular dependency.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
