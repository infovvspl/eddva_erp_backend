import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { StaffPlatformUser } from './staff-auth.service';
import type { StaffRequest } from './staff-request';

export const StaffUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): StaffPlatformUser => {
    const request = ctx.switchToHttp().getRequest<StaffRequest>();
    return request.staffUser as StaffPlatformUser;
  },
);
