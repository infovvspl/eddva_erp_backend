import { SetMetadata } from '@nestjs/common';

export const CANTEEN_PERMISSIONS_KEY = 'canteen_permissions';

export interface CanteenPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'orders', action: 'create' })
 * Specifies the required resource and action pair to access a Canteen
 * endpoint.
 */
export const RequirePermission = (requirement: CanteenPermissionRequirement) =>
  SetMetadata(CANTEEN_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'reports', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (
  ...requirements: CanteenPermissionRequirement[]
) => SetMetadata(CANTEEN_PERMISSIONS_KEY, requirements);
