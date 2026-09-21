import { SetMetadata } from '@nestjs/common';

export const ALUMNI_PERMISSIONS_KEY = 'alumni_permissions';
export const ALUMNI_STAFF_ONLY_KEY = 'alumni_staff_only';

export interface AlumniPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'events', action: 'create' })
 * Specifies the required resource and action pair to access an Alumni
 * endpoint.
 */
export const RequirePermission = (requirement: AlumniPermissionRequirement) =>
  SetMetadata(ALUMNI_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'alumni', action: 'read' }, ...)
 * Allows specifying multiple resource & action requirements — ALL must be held.
 */
export const RequirePermissions = (
  ...requirements: AlumniPermissionRequirement[]
) => SetMetadata(ALUMNI_PERMISSIONS_KEY, requirements);

/**
 * Marks a route (or controller) as reserved for alumni-office staff: an alumni
 * portal account is refused even if its role happens to hold the permission.
 * Routes that alumni may use (own-record access) do NOT carry this and instead
 * scope their data to the caller inside the service.
 */
export const StaffOnly = () => SetMetadata(ALUMNI_STAFF_ONLY_KEY, true);
