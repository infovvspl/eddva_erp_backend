import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/**
 * Runs `fn`, turning a database unique-constraint violation (the last line of
 * defence behind every "check then insert") into a 409 instead of a raw 500.
 */
export async function orConflict<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictException(message);
    throw err;
  }
}
