import { ForbiddenException } from '@nestjs/common';

/**
 * Guard for tenant-scoped services: every query must be filtered by the caller's
 * institute, so a missing or blank institute is refused rather than silently
 * turning into an unfiltered (cross-school) query.
 */
export function requireInstituteId(instituteId: unknown): string {
  if (typeof instituteId !== 'string' || instituteId.trim() === '') {
    throw new ForbiddenException('No institute is associated with this session');
  }
  return instituteId;
}
