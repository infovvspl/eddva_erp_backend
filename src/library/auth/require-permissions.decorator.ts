import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'library_permissions';

export interface PermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'catalog', action: 'read' })
 * Specifies the required resource and action pair to access an endpoint.
 */
export const RequirePermission = (requirement: PermissionRequirement) =>
  SetMetadata(PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'catalog', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (...requirements: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, requirements);
