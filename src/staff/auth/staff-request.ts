import type { Request } from 'express';
import type { StaffPlatformUser } from './staff-auth.service';

/** Express request after StaffJwtGuard has attached the verified user. */
export interface StaffRequest extends Request {
  staffUser?: StaffPlatformUser;
}
