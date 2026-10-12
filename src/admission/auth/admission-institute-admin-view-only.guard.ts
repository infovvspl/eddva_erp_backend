import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Institute Admins have full read/write access to Admission, same as other
 * modules. Kept as its own guard (rather than removed from the controllers'
 * @UseGuards lists) so re-introducing a restriction later is a one-line change.
 */
@Injectable()
export class AdmissionInstituteAdminViewOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
