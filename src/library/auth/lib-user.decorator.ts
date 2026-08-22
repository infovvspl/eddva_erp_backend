import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LibPlatformUser } from './lib-auth.service';

/**
 * @LibUser() — injects the current Library Platform user into a controller param.
 * Requires LibJwtGuard to run first.
 */
export const LibUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): LibPlatformUser => {
    return ctx.switchToHttp().getRequest().libUser;
  },
);
