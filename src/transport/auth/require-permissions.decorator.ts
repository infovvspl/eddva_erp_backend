import { SetMetadata } from '@nestjs/common';

export const TRANSPORT_PERMISSIONS_KEY = 'transport_permissions';

export interface TransportPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'vehicles', action: 'manage' })
 * Specifies the required resource and action pair to access a Transport endpoint.
 */
export const RequirePermission = (requirement: TransportPermissionRequirement) =>
  SetMetadata(TRANSPORT_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'vehicles', action: 'view' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (...requirements: TransportPermissionRequirement[]) =>
  SetMetadata(TRANSPORT_PERMISSIONS_KEY, requirements);
