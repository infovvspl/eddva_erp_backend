import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SportsPlatformUser } from './sports-auth.service';

export const SportsUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SportsPlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.sportsUser;
  },
);
