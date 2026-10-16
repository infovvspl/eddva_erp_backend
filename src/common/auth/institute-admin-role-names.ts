/**
 * Single source of truth for "which EDDVA role names mean Institute Admin",
 * shared across every module's SSO exchange and permission checks. This
 * used to be copy-pasted per module (hostel/common/, staff/common/,
 * canteen/common/, etc.) — new modules should import from here instead of
 * adding another copy.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
