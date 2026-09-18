import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CanteenPlatformUser } from './canteen-auth.service';

export const CanteenUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CanteenPlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.canteenUser;
  },
);
