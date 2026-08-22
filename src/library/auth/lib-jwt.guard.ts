import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LibAuthService } from './lib-auth.service';

export const IS_LIB_PUBLIC = 'isLibPublic';

/**
 * LibJwtGuard — validates Library Platform JWT on protected routes.
 * Attaches `req.libUser` (LibPlatformUser) for downstream use.
 */
@Injectable()
export class LibJwtGuard implements CanActivate {
  constructor(
    private readonly authService: LibAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_LIB_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Library Platform: No bearer token provided');
    }

    req.libUser = this.authService.verifyLibraryToken(token);
    return true;
  }
}
