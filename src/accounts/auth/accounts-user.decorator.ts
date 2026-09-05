import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccountsPlatformUser } from './accounts-auth.service';

export const AccountsUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AccountsPlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.accountsUser;
  },
);
