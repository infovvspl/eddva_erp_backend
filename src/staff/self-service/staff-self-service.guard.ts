import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { StaffRequest } from '../auth/staff-request';

/**
 * Gate for `/api/staff/me/*`: requires a teacher self-service session
 * (`self_staff_id` set by `exchangeTeacherSsoToken`), not the dynamic RBAC
 * permission tables — a teacher is scoped to their own record structurally,
 * so there is nothing for an admin to grant or misconfigure here.
 */
@Injectable()
export class StaffSelfServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    if (typeof req.staffUser?.self_staff_id !== 'number') {
      throw new ForbiddenException('This session is not a teacher self-service session');
    }
    return true;
  }
}
