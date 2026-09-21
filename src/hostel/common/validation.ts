/** Digits with optional leading +, spaces, dashes and brackets; 7–20 characters. */
export const PHONE_REGEX = /^\+?[0-9()\-\s]{7,20}$/;
export const PHONE_MESSAGE = 'must be a valid phone number';

/** Financial amounts are stored as Decimal(12,2). */
export const MAX_AMOUNT = 9_999_999_999.99;

/** Academic year like "2026-27" — the end year must be the start year + 1. */
export const ACADEMIC_YEAR_REGEX = /^(\d{4})-(\d{2})$/;
export const ACADEMIC_YEAR_MESSAGE =
  'academic_year must look like 2026-27 (consecutive years)';

export function isValidAcademicYear(value: string): boolean {
  const match = ACADEMIC_YEAR_REGEX.exec(value);
  if (!match) return false;
  const start = Number(match[1]);
  return (
    start >= 2000 && start <= 2100 && (start + 1) % 100 === Number(match[2])
  );
}
