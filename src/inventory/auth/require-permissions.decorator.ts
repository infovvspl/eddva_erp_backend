import { SetMetadata } from '@nestjs/common';

export const INVENTORY_PERMISSIONS_KEY = 'inventory_permissions';

export interface InventoryPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'issues', action: 'create' })
 * Specifies the required resource and action pair to access an Inventory endpoint.
 */
export const RequirePermission = (requirement: InventoryPermissionRequirement) =>
  SetMetadata(INVENTORY_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'stock', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (...requirements: InventoryPermissionRequirement[]) =>
  SetMetadata(INVENTORY_PERMISSIONS_KEY, requirements);
