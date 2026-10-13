import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FeeRequest } from './student-fees-request';

export const FeeUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<FeeRequest>();
  return req.feeUser;
});
