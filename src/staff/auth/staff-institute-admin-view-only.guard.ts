import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Institute Admins have full read/write access to Staff, same as other
 * modules. Kept as its own guard (rather than removed from the controllers'
 * @UseGuards lists) so re-introducing a restriction later is a one-line change.
 */
@Injectable()
export class StaffInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
