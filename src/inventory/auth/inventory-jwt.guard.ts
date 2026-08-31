import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InventoryAuthService } from './inventory-auth.service';

@Injectable()
export class InventoryJwtGuard implements CanActivate {
  constructor(private readonly authService: InventoryAuthService) {}

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

    const payload = this.authService.verifyInventoryToken(token);
    req.inventoryUser = payload;
    return true;
  }
}
