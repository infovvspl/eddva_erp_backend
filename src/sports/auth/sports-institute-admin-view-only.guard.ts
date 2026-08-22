import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class SportsInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.sportsUser;

    if (!user) return true;

    const isInstituteAdmin =
      user.is_institute_admin || user.user_role === 'INSTITUTE_ADMIN';

    if (!isInstituteAdmin) return true;

    const readMethods = ['GET', 'HEAD', 'OPTIONS'];

    // Also bypass auth & role management sub-routes so admin can configure roles
    const path: string = req.path || req.url || '';
    if (path.includes('/sports/roles') || path.includes('/sports/auth')) {
      return true;
    }

    if (!readMethods.includes(req.method.toUpperCase())) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Sports operational tasks. Please use an account with an assigned Sports role (Coach/House Master/Sports Admin) to perform write actions.',
      );
    }

    return true;
  }
}
