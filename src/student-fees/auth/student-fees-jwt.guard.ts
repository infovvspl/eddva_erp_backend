import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { StudentFeesAuthService } from './student-fees-auth.service';
import type { FeeRequest } from './student-fees-request';

@Injectable()
export class StudentFeesJwtGuard implements CanActivate {
  constructor(private readonly authService: StudentFeesAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FeeRequest>();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header. Please log in.');
    }
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization format. Must be "Bearer <token>".');
    }

    req.feeUser = this.authService.verifyFeeToken(token);
    return true;
  }
}
