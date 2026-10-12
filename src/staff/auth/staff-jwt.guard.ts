import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import type { StaffRequest } from './staff-request';

@Injectable()
export class StaffJwtGuard implements CanActivate {
  constructor(private readonly authService: StaffAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<StaffRequest>();
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

    req.staffUser = this.authService.verifyStaffToken(token);
    return true;
  }
}
