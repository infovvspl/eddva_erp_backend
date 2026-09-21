import type { Request } from 'express';
import type { AlumniPlatformUser } from './alumni-auth.service';

/** Express request after AlumniJwtGuard has attached the verified user. */
export interface AlumniRequest extends Request {
  alumniUser?: AlumniPlatformUser;
}
