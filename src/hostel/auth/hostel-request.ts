import type { Request } from 'express';
import type { HostelPlatformUser } from './hostel-auth.service';

/** Express request after HostelJwtGuard has attached the verified user. */
export interface HostelRequest extends Request {
  hostelUser?: HostelPlatformUser;
}
