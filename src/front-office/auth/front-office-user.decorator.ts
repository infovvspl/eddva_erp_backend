import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FrontOfficePlatformUser } from './front-office-auth.service';

export const FrontOfficeUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): FrontOfficePlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.frontOfficeUser;
  },
);
