/**
 * Single source of truth for "which EDDVA role names mean Institute Admin"
 * for the Sales & Purchase module. Lives in its own file (rather than
 * alongside `isSpAdmin` in sales-purchase-access.service.ts, which imports
 * `SalesPurchasePlatformUser` from sales-purchase-auth.service.ts) so that
 * sales-purchase-auth.service.ts can import it too without a circular
 * dependency between the two.
 */
export const INSTITUTE_ADMIN_ROLE_NAMES = [
  'INSTITUTE_ADMIN',
  'INSTITUTE ADMINISTRATOR',
  'INSTITUTE_ADMINISTRATOR',
] as const;
