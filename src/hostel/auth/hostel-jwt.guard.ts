import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { HostelAuthService } from './hostel-auth.service';
import type { HostelRequest } from './hostel-request';

@Injectable()
export class HostelJwtGuard implements CanActivate {
  constructor(private readonly authService: HostelAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HostelRequest>();
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

    req.hostelUser = this.authService.verifyHostelToken(token);
    return true;
  }
}
