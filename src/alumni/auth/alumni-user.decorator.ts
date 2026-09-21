import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AlumniPlatformUser } from './alumni-auth.service';
import type { AlumniRequest } from './alumni-request';

export const AlumniUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AlumniPlatformUser => {
    const request = ctx.switchToHttp().getRequest<AlumniRequest>();
    return request.alumniUser as AlumniPlatformUser;
  },
);
