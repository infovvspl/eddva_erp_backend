import * as crypto from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

/**
 * AES-256-GCM helper for encrypting visitor ID proof numbers at rest.
 * Stored format: "<ivHex>:<authTagHex>:<cipherTextHex>".
 *
 * The key comes from FRONT_OFFICE_ID_PROOF_KEY only: no fallback to JWT_SECRET
 * (so rotating a login secret can never make stored ID proofs unreadable) and
 * no committed default. A missing key fails closed.
 */
function resolveKey(): Buffer {
  const raw = process.env.FRONT_OFFICE_ID_PROOF_KEY;
  if (!raw) {
    throw new InternalServerErrorException(
      'FRONT_OFFICE_ID_PROOF_KEY must be set to store visitor ID proofs',
    );
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptIdProof(plain: string): string {
  const key = resolveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptIdProof(stored: string): string {
  const [ivHex, authTagHex, cipherHex] = stored.split(':');
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error('Malformed encrypted ID proof value');
  }
  const key = resolveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]);
  return plain.toString('utf8');
}

/** Masks an ID proof number for display when the viewer lacks sensitive-view permission. */
export function maskIdProof(plain: string): string {
  if (plain.length <= 4) return '*'.repeat(plain.length);
  return `${'*'.repeat(plain.length - 4)}${plain.slice(-4)}`;
}
