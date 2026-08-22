import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * LibInstituteAdminViewOnlyGuard — blocks mutating HTTP methods (POST/PATCH/DELETE)
 * for users whose role is INSTITUTE_ADMIN.
 *
 * Institute Admins have View-Only access to the operational Library desk.
 * They have full write access only to the Roles & Permissions module.
 *
 * Place this guard AFTER LibJwtGuard so req.libUser is already populated.
 */
@Injectable()
export class LibInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const libUser = req.libUser;

    if (!libUser) return true; // LibJwtGuard will handle auth — this guard only checks role

    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    const isInstituteAdmin = libUser.is_institute_admin || libUser.user_role === 'INSTITUTE_ADMIN';

    if (isMutation && isInstituteAdmin) {
      throw new ForbiddenException(
        'Institute Admin has view-only access to Library operational tasks. ' +
        'Please use an account with an assigned Librarian role to perform this action.',
      );
    }

    return true;
  }
}
