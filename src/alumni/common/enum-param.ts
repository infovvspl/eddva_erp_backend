import { BadRequestException } from '@nestjs/common';

/**
 * Validates a free-form query string against an enum's values. Prisma throws
 * (a 500) on an unknown enum value, so report filters that are shared across
 * many report types are checked here and answered with a 400 instead.
 */
export function enumParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BadRequestException(
      `${name} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value as T;
}
