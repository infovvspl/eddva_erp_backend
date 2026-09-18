import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { CanteenAuthService } from './canteen-auth.service';

@Injectable()
export class CanteenJwtGuard implements CanActivate {
  constructor(private readonly authService: CanteenAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header. Please log in.');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization format. Must be "Bearer <token>".');
    }

    const payload = this.authService.verifyCanteenToken(token);
    req.canteenUser = payload;
    return true;
  }
}
