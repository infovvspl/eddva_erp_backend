/** entityType strings used with the shared core AuditService (via InventoryAuditService). */
export const INV_ENTITY = {
  CATEGORY: 'inventory_category',
  LOCATION: 'inventory_location',
  VENDOR: 'inventory_vendor',
  ITEM: 'inventory_item',
  PURCHASE: 'inventory_purchase',
  TRANSFER: 'inventory_transfer',
  ADJUSTMENT: 'inventory_adjustment',
  ASSET_UNIT: 'inventory_asset_unit',
  ISSUE: 'inventory_issue',
  RETURN: 'inventory_return',
  MAINTENANCE: 'inventory_maintenance',
  HOLDER: 'inventory_holder',
} as const;
