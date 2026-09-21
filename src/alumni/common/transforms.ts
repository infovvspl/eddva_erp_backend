import { Transform } from 'class-transformer';

/**
 * Query-string booleans arrive as "true"/"false". Implicit conversion would turn
 * the string "false" into `true`, so parse them explicitly; anything else is left
 * as-is for @IsBoolean() to reject.
 */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });

/** Trims strings; a blank string becomes `undefined` so optional fields can be cleared by omission. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/** Trim + lower-case (emails, tags). */
export const TrimLower = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' ? undefined : trimmed;
  });

/**
 * Query-string list: accepts `a,b,c`, repeated params or a JSON array, and
 * returns a trimmed string[]; numbers stay strings for @IsString/@Type to handle.
 */
export const ToList = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const raw: unknown[] = Array.isArray(value)
      ? (value as unknown[])
      : typeof value === 'string'
        ? value.split(',')
        : [value];
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : v))
      .filter((v) => v !== '');
  });
