import type { Request } from 'express';
import type { AdmissionPlatformUser } from './admission-auth.service';

/** Express request after AdmissionJwtGuard has attached the verified user. */
export interface AdmissionRequest extends Request {
  admissionUser?: AdmissionPlatformUser;
}
