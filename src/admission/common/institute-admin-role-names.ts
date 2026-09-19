/**
 * Single source of truth for "which EDDVA role names mean Institute Admin"
 * for the Admission module. Lives in its own file (rather than alongside
 * `isAdmissionAdmin` in admission-access.service.ts, which imports
 * `AdmissionPlatformUser` from admission-auth.service.ts) so that
 * admission-auth.service.ts can import it too without a circular dependency.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
