import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CANTEEN_RESOURCE_CATALOG = [
  {
    resource: 'menu_categories',
    name: 'Menu Categories',
    description: 'Manage canteen menu categories',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'menu_items',
    name: 'Menu Items',
    description: 'Manage canteen menu items and toggle their availability',
    available_actions: ['read', 'create', 'update', 'delete', 'availability'],
  },
  {
    resource: 'menu_schedules',
    name: 'Menu Item Schedules',
    description: 'Manage day/time availability schedules of menu items',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'members',
    name: 'Canteen Members',
    description: 'Manage the canteen member directory and barcode lookup',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'barcode_lookup',
    ],
  },
  {
    resource: 'pos_terminals',
    name: 'POS Terminals',
    description: 'Register and manage POS terminals',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'pos_shifts',
    name: 'POS Shifts',
    description: 'Open and close POS terminal shifts and reconcile cash',
    available_actions: ['read', 'open', 'close'],
  },
  {
    resource: 'orders',
    name: 'Orders',
    description: 'Create, update, change the status of and cancel orders',
    available_actions: ['read', 'create', 'update', 'cancel'],
  },
  {
    resource: 'order_items',
    name: 'Order Items',
    description: 'Add, modify and remove line items on unpaid orders',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'payments',
    name: 'Payments',
    description: 'Record order payments and process refunds/reversals',
    available_actions: ['read', 'create', 'refund'],
  },
  {
    resource: 'wallets',
    name: 'Member Wallets',
    description:
      'Manage member wallets, top-ups, and blocking/unblocking of wallets',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'topup',
      'block',
      'unblock',
    ],
  },
  {
    resource: 'wallet_transactions',
    name: 'Wallet Ledger',
    description: 'View the append-only wallet transaction ledger',
    available_actions: ['read'],
  },
  {
    resource: 'reports',
    name: 'Canteen Reports',
    description:
      'View sales, item-sales, category-sales, payment-summary and shift reports',
    available_actions: ['read'],
  },
] as const;

export class CanteenPermissionRuleDto {
  @ApiProperty({
    example: 'orders',
    description: 'Target resource name',
  })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'create'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateCanteenDynamicRoleDto {
  @ApiProperty({ example: 'Counter Staff' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example:
      'Runs a POS terminal: opens shifts, looks up members, takes orders and payments',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [CanteenPermissionRuleDto],
    example: [
      { resource: 'menu_items', actions: ['read'] },
      { resource: 'members', actions: ['read', 'barcode_lookup'] },
      { resource: 'pos_shifts', actions: ['read', 'open', 'close'] },
      { resource: 'orders', actions: ['read', 'create', 'update'] },
      { resource: 'payments', actions: ['read', 'create'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanteenPermissionRuleDto)
  permissions: CanteenPermissionRuleDto[];
}
