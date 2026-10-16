import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

/** Claims read from the core EDDVA ERP token exchanged at a module's SSO endpoint. */
export interface ErpTokenClaims {
  id?: string;
  sub?: string;
  role?: string;
  instituteId?: string;
  institute_id?: string;
  tenantId?: string;
  email?: string;
  name?: string;
  fullName?: string;
  userName?: string;
}

/**
 * Verifies a core EDDVA ERP token against every configured ERP signing
 * secret (SCHOOL_JWT_SECRET, JWT_SECRET, and JWT_SECRET+'_school'). This was
 * identically copy-pasted into every module's own `*-auth.service.ts` before
 * being extracted here — every module's SSO exchange should call this
 * instead of re-implementing it.
 */
export function verifyErpToken(token: string): ErpTokenClaims {
  const secrets = [
    process.env.SCHOOL_JWT_SECRET,
    process.env.JWT_SECRET,
    process.env.JWT_SECRET ? `${process.env.JWT_SECRET}_school` : undefined,
  ].filter((secret): secret is string => Boolean(secret));

  if (secrets.length === 0) {
    throw new Error('SCHOOL_JWT_SECRET or JWT_SECRET must be set');
  }

  for (const secret of [...new Set(secrets)]) {
    try {
      return jwt.verify(token, secret) as ErpTokenClaims;
    } catch {
      // Try the next configured ERP signing secret.
    }
  }

  throw new UnauthorizedException('Invalid or expired EDDVA session token');
}

export interface ErpIdentity {
  eddva_user_id: string;
  institute_id: string;
  user_role: string;
  user_email?: string;
  user_name: string;
}

/**
 * Resolves the common identity fields out of a verified ERP token's claims
 * (every module's SSO exchange reads the same handful of fields from the
 * same handful of alternate claim names).
 */
export function resolveErpIdentity(decoded: ErpTokenClaims): ErpIdentity {
  const eddva_user_id = decoded.id || decoded.sub;
  const user_role = (decoded.role || '').toUpperCase();
  const institute_id = decoded.instituteId || decoded.institute_id || decoded.tenantId || '';
  const user_email = decoded.email;
  const user_name =
    decoded.name ||
    decoded.fullName ||
    decoded.userName ||
    (user_email ? user_email.split('@')[0] : 'Institute Admin');

  if (!eddva_user_id || !institute_id) {
    throw new UnauthorizedException('Token missing required fields (user id or institute id)');
  }

  return { eddva_user_id, institute_id, user_role, user_email, user_name };
}
