import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TransportPlatformUser } from './transport-auth.service';

export const TransportUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TransportPlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.transportUser;
  },
);
