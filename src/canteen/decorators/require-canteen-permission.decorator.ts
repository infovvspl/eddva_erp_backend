import { SetMetadata } from '@nestjs/common';

export const CANTEEN_PERMISSIONS_KEY = 'canteen_permissions';
export const RequireCanteenPermission = (...permissions: string[]) =>
  SetMetadata(CANTEEN_PERMISSIONS_KEY, permissions);
