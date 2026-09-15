import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { SalesPurchaseAuthService } from './sales-purchase-auth.service';

@Injectable()
export class SalesPurchaseJwtGuard implements CanActivate {
  constructor(private readonly authService: SalesPurchaseAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];

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

    const payload = this.authService.verifySalesPurchaseToken(token);
    req.salesPurchaseUser = payload;
    return true;
  }
}
