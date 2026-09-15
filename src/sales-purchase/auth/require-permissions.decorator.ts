import { SetMetadata } from '@nestjs/common';

export const SALES_PURCHASE_PERMISSIONS_KEY = 'sales_purchase_permissions';

export interface SalesPurchasePermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'purchase_orders', action: 'approve' })
 * Specifies the required resource and action pair to access a Sales &
 * Purchase endpoint.
 */
export const RequirePermission = (
  requirement: SalesPurchasePermissionRequirement,
) => SetMetadata(SALES_PURCHASE_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'reports', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (
  ...requirements: SalesPurchasePermissionRequirement[]
) => SetMetadata(SALES_PURCHASE_PERMISSIONS_KEY, requirements);
