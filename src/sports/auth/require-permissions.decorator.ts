import { SetMetadata } from '@nestjs/common';

export const SPORTS_PERMISSIONS_KEY = 'sports_permissions';

export interface SportsPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'houses', action: 'award_points' })
 * Specifies the required resource and action pair to access a Sports endpoint.
 */
export const RequirePermission = (requirement: SportsPermissionRequirement) =>
  SetMetadata(SPORTS_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'houses', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (...requirements: SportsPermissionRequirement[]) =>
  SetMetadata(SPORTS_PERMISSIONS_KEY, requirements);
