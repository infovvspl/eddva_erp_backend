import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AlumniAuthService } from './alumni-auth.service';
import type { AlumniRequest } from './alumni-request';

@Injectable()
export class AlumniJwtGuard implements CanActivate {
  constructor(private readonly authService: AlumniAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AlumniRequest>();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException(
        'Missing Authorization header. Please log in.',
      );
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid Authorization format. Must be "Bearer <token>".',
      );
    }

    req.alumniUser = this.authService.verifyAlumniToken(token);
    return true;
  }
}
