import { SetMetadata } from '@nestjs/common';

export const FRONT_OFFICE_PERMISSIONS_KEY = 'front_office_permissions';

export interface FrontOfficePermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'visitors', action: 'checkin' })
 * Specifies the required resource and action pair to access a Front Office endpoint.
 */
export const RequirePermission = (requirement: FrontOfficePermissionRequirement) =>
  SetMetadata(FRONT_OFFICE_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'visitors', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (...requirements: FrontOfficePermissionRequirement[]) =>
  SetMetadata(FRONT_OFFICE_PERMISSIONS_KEY, requirements);
