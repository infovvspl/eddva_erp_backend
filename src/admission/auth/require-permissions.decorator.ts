import { SetMetadata } from '@nestjs/common';

export const ADMISSION_PERMISSIONS_KEY = 'admission_permissions';

export interface AdmissionPermissionRequirement {
  resource: string;
  action: string;
}

/**
 * @RequirePermission({ resource: 'applications', action: 'create' })
 * Specifies the required resource and action pair to access an Admission
 * endpoint.
 */
export const RequirePermission = (
  requirement: AdmissionPermissionRequirement,
) => SetMetadata(ADMISSION_PERMISSIONS_KEY, [requirement]);

/**
 * @RequirePermissions({ resource: 'offers', action: 'read' }, ...)
 * Allows specifying multiple resource & action requirements — ALL must be held.
 */
export const RequirePermissions = (
  ...requirements: AdmissionPermissionRequirement[]
) => SetMetadata(ADMISSION_PERMISSIONS_KEY, requirements);
