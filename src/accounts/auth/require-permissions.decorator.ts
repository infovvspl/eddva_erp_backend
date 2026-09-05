import { SetMetadata } from '@nestjs/common';

export const ACCOUNTS_PERMISSIONS_KEY = 'accounts_permissions';

export interface AccountsPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'vouchers', action: 'post' })
 * Specifies the required resource and action pair to access an Accounts endpoint.
 */
export const RequirePermission = (requirement: AccountsPermissionRequirement) =>
  SetMetadata(ACCOUNTS_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'reports', action: 'read' }, ...)
 * Allows specifying multiple resource & action permission requirements.
 */
export const RequirePermissions = (...requirements: AccountsPermissionRequirement[]) =>
  SetMetadata(ACCOUNTS_PERMISSIONS_KEY, requirements);
