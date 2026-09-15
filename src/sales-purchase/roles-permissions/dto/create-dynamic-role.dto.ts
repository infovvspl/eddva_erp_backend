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

export const SALES_PURCHASE_RESOURCE_CATALOG = [
  {
    resource: 'masters',
    name: 'Shared Masters',
    description:
      'Item categories, units of measure, tax codes, payment terms, warehouses',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'vendors',
    name: 'Vendors',
    description: 'Manage vendors, vendor contacts, and vendor bank details',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'customers',
    name: 'Customers',
    description: 'Manage customers and customer contacts',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'items',
    name: 'Item Master',
    description: 'Manage the sales & purchase item master',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'purchase_orders',
    name: 'Purchase Orders',
    description:
      'Create, edit, and drive purchase orders through the approval workflow',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'submit',
      'approve',
      'reject',
      'cancel',
    ],
  },
  {
    resource: 'approval_rules',
    name: 'Approval Rules',
    description:
      'Configure PO approval amount thresholds and required approver roles',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'grns',
    name: 'Goods Receipt Notes',
    description: 'Record and post goods receipt notes against purchase orders',
    available_actions: ['read', 'create', 'update', 'delete', 'post', 'cancel'],
  },
  {
    resource: 'purchase_invoices',
    name: 'Purchase Invoices',
    description: 'Create, three-way match, and post vendor invoices',
    available_actions: ['read', 'create', 'update', 'delete', 'post', 'cancel'],
  },
  {
    resource: 'purchase_payments',
    name: 'Purchase Payments',
    description: 'Record payments against posted purchase invoices',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'sales_orders',
    name: 'Sales Orders',
    description: 'Create, confirm, and cancel sales orders',
    available_actions: [
      'read',
      'create',
      'update',
      'delete',
      'confirm',
      'cancel',
    ],
  },
  {
    resource: 'sales_invoices',
    name: 'Sales Invoices',
    description: 'Create and post customer invoices',
    available_actions: ['read', 'create', 'update', 'delete', 'post', 'cancel'],
  },
  {
    resource: 'sales_receipts',
    name: 'Sales Receipts',
    description: 'Record receipts against posted sales invoices',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'reports',
    name: 'Purchase & Sales Registers',
    description: 'View the Purchase Register and Sales Register',
    available_actions: ['read'],
  },
  {
    resource: 'dashboard',
    name: 'Dashboard',
    description: 'View sales & purchase dashboard summary metrics',
    available_actions: ['read'],
  },
] as const;

export class SalesPurchasePermissionRuleDto {
  @ApiProperty({
    example: 'purchase_orders',
    description: 'Target resource name',
  })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'create', 'submit'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateSalesPurchaseDynamicRoleDto {
  @ApiProperty({ example: 'Purchase Clerk' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'Creates and submits purchase orders, records GRNs',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [SalesPurchasePermissionRuleDto],
    example: [
      { resource: 'vendors', actions: ['read'] },
      { resource: 'items', actions: ['read'] },
      {
        resource: 'purchase_orders',
        actions: ['read', 'create', 'update', 'submit'],
      },
      { resource: 'grns', actions: ['read', 'create', 'post'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesPurchasePermissionRuleDto)
  permissions: SalesPurchasePermissionRuleDto[];
}
