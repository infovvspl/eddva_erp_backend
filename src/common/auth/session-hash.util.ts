import { createHash } from 'crypto';

/**
 * Hashes a module session token before it's persisted. A module's
 * `*SsoSession` row must never store the raw signed JWT at rest — only
 * enough to look up/invalidate the session by its hash.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
