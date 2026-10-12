import { SetMetadata } from '@nestjs/common';

export const STAFF_PERMISSIONS_KEY = 'staff_permissions';

export interface StaffPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'staff_members', action: 'create' })
 * Specifies the required resource and action pair to access a Staff
 * endpoint.
 */
export const RequirePermission = (requirement: StaffPermissionRequirement) =>
  SetMetadata(STAFF_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'departments', action: 'read' }, ...)
 * Allows specifying multiple resource & action requirements — ALL must be held.
 */
export const RequirePermissions = (
  ...requirements: StaffPermissionRequirement[]
) => SetMetadata(STAFF_PERMISSIONS_KEY, requirements);
