import { SetMetadata } from '@nestjs/common';

export const HOSTEL_PERMISSIONS_KEY = 'hostel_permissions';

export interface HostelPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'gate_passes', action: 'create' })
 * Specifies the required resource and action pair to access a Hostel
 * endpoint.
 */
export const RequirePermission = (requirement: HostelPermissionRequirement) =>
  SetMetadata(HOSTEL_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'attendance', action: 'read' }, ...)
 * Allows specifying multiple resource & action requirements — ALL must be held.
 */
export const RequirePermissions = (
  ...requirements: HostelPermissionRequirement[]
) => SetMetadata(HOSTEL_PERMISSIONS_KEY, requirements);
