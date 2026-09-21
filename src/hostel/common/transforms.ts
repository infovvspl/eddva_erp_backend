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
