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

export const ACCOUNTS_RESOURCE_CATALOG = [
  {
    resource: 'coa',
    name: 'Chart of Accounts',
    description: 'Manage account groups and ledger accounts',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'cost_centers',
    name: 'Cost Centers',
    description: 'Manage cost centers',
    available_actions: ['read', 'create', 'update'],
  },
  {
    resource: 'financial_years',
    name: 'Financial Years',
    description: 'Create and close financial years',
    available_actions: ['read', 'create', 'close'],
  },
  {
    resource: 'vouchers',
    name: 'Vouchers',
    description: 'Create, post, and cancel/reverse Journal/Payment/Receipt/Contra vouchers',
    available_actions: ['read', 'create', 'post', 'cancel'],
  },
  {
    resource: 'ledger',
    name: 'General Ledger',
    description: 'View the General Ledger for an account',
    available_actions: ['read'],
  },
  {
    resource: 'reports',
    name: 'Reports',
    description: 'Day Book, Cash Book, Bank Book, Trial Balance, Balance Sheet, Income & Expenditure',
    available_actions: ['read'],
  },
  {
    resource: 'attachments',
    name: 'Voucher Attachments',
    description: 'Upload, view, and delete voucher attachments',
    available_actions: ['read', 'manage'],
  },
  {
    resource: 'mappings',
    name: 'Account Mappings',
    description: 'Configure the AR/AP/Sales-Income/Purchase-Expense/Cash/Bank account mappings used by auto-posting',
    available_actions: ['manage'],
  },
] as const;

export class AccountsPermissionRuleDto {
  @ApiProperty({ example: 'vouchers', description: 'Target resource name' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'create', 'post'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateAccountsDynamicRoleDto {
  @ApiProperty({ example: 'Accounts Clerk' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Creates draft vouchers and views reports; cannot post or close the year' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [AccountsPermissionRuleDto],
    example: [
      { resource: 'coa', actions: ['read'] },
      { resource: 'cost_centers', actions: ['read'] },
      { resource: 'financial_years', actions: ['read'] },
      { resource: 'vouchers', actions: ['read', 'create'] },
      { resource: 'ledger', actions: ['read'] },
      { resource: 'reports', actions: ['read'] },
      { resource: 'attachments', actions: ['read', 'manage'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccountsPermissionRuleDto)
  permissions: AccountsPermissionRuleDto[];
}
