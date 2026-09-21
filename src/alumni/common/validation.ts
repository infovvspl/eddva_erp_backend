/** Digits with optional leading +, spaces, dashes and brackets; 7-20 characters. */
export const PHONE_REGEX = /^\+?[0-9()\-\s]{7,20}$/;
export const PHONE_MESSAGE = 'must be a valid phone number';

/** Financial amounts are stored as Decimal(12,2). */
export const MAX_AMOUNT = 9_999_999_999.99;

/** Only http(s) links are accepted for profile / job / resume URLs (no javascript:, data: ...). */
export const HTTP_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
};

/** Current calendar year in UTC — the upper bound for batch/graduation years. */
export function currentYear(): number {
  return new Date().getUTCFullYear();
}
