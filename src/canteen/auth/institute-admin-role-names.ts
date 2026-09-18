/**
 * Single source of truth for "which EDDVA role names mean Institute Admin"
 * for the Canteen module. Local copy (not imported from Sales-Purchase's
 * version) to avoid coupling two independent business modules together —
 * mirrors the same small constant list every satellite auth island keeps.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
