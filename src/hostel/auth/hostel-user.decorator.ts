import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { HostelPlatformUser } from './hostel-auth.service';
import type { HostelRequest } from './hostel-request';

export const HostelUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): HostelPlatformUser => {
    const request = ctx.switchToHttp().getRequest<HostelRequest>();
    return request.hostelUser as HostelPlatformUser;
  },
);
