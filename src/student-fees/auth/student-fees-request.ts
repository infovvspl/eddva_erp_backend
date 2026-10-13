import type { Request } from 'express';
import type { FeePlatformUser } from './student-fees-auth.service';

export interface FeeRequest extends Request {
  feeUser?: FeePlatformUser;
}
