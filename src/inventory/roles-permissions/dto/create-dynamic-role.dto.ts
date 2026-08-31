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

export const INVENTORY_RESOURCE_CATALOG = [
  {
    resource: 'categories',
    name: 'Categories',
    description: 'Manage item categories and sub-categories',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'locations',
    name: 'Locations',
    description: 'Manage stores, departments, classrooms, labs',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'vendors',
    name: 'Vendors',
    description: 'Manage inventory vendors',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'items',
    name: 'Item Master',
    description: 'Manage the item/inventory master and vendor associations',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'stock',
    name: 'Stock Register',
    description: 'Purchases, transfers, adjustments, ledger, and balance reconciliation',
    available_actions: ['read', 'purchase', 'transfer', 'adjust', 'reconcile'],
  },
  {
    resource: 'assets',
    name: 'Asset Management',
    description: 'Individually tracked asset units and maintenance history',
    available_actions: ['read', 'create', 'update', 'maintain'],
  },
  {
    resource: 'issues',
    name: 'Issues & Returns',
    description: 'Issue and return stock/assets, and approve pending issues',
    available_actions: ['read', 'create', 'return', 'approve'],
  },
  {
    resource: 'holders',
    name: 'Holders',
    description: 'View holders (staff/student/department) and their current issues',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'dashboard',
    name: 'Dashboard & Alerts',
    description: 'View inventory dashboard metrics and alerts',
    available_actions: ['read'],
  },
] as const;

export class InventoryPermissionRuleDto {
  @ApiProperty({ example: 'stock', description: 'Target resource name' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'purchase'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateInventoryDynamicRoleDto {
  @ApiProperty({ example: 'Store Keeper' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Receives stock, issues items, processes returns' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [InventoryPermissionRuleDto],
    example: [
      { resource: 'items', actions: ['read'] },
      { resource: 'stock', actions: ['read', 'purchase', 'transfer', 'adjust'] },
      { resource: 'issues', actions: ['read', 'create', 'return'] },
      { resource: 'assets', actions: ['read', 'update', 'maintain'] },
      { resource: 'holders', actions: ['read'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryPermissionRuleDto)
  permissions: InventoryPermissionRuleDto[];
}
