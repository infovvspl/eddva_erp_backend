import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AdmissionAuthService } from './admission-auth.service';
import type { AdmissionRequest } from './admission-request';

@Injectable()
export class AdmissionJwtGuard implements CanActivate {
  constructor(private readonly authService: AdmissionAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdmissionRequest>();
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

    req.admissionUser = this.authService.verifyAdmissionToken(token);
    return true;
  }
}
