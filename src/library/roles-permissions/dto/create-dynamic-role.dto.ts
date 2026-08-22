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

/**
 * Enterprise Resource & Action Permission Matrix Catalog Definition.
 * Frontend UI renders this catalog as a clean matrix grid.
 */
export const LIBRARY_RESOURCE_CATALOG = [
  {
    resource: 'catalog',
    name: 'Book Catalog',
    description: 'Manage book titles, authors, categories, and cover images',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'copies',
    name: 'Physical Copies',
    description: 'Manage physical book copies, accession numbers, barcodes, rack locations',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'issues',
    name: 'Issue & Return',
    description: 'Issue book copies to members, process returns, and renew loans',
    available_actions: ['read', 'issue', 'return', 'renew'],
  },
  {
    resource: 'reservations',
    name: 'Book Reservations',
    description: 'Place and manage book holds/reservations',
    available_actions: ['read', 'reserve', 'cancel'],
  },
  {
    resource: 'fines',
    name: 'Fines & Payments',
    description: 'Calculate overdue fines, collect payments, and waive fines',
    available_actions: ['read', 'collect', 'waive'],
  },
  {
    resource: 'members',
    name: 'Library Members',
    description: 'Manage library members, card numbers, and membership status',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'categories',
    name: 'Book Categories',
    description: 'Manage library book category classification',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'membership_rules',
    name: 'Membership Rules',
    description: 'Configure loan periods, max books allowed, fine rates per day',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'vendors',
    name: 'Book Vendors',
    description: 'Manage vendors and book acquisition sources',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'reports',
    name: 'Library Analytics & Reports',
    description: 'Access inventory, circulation, and fine reports',
    available_actions: ['read', 'export'],
  },
] as const;

export class PermissionRuleDto {
  @ApiProperty({ example: 'catalog', description: 'Target resource name' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'create', 'update'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateDynamicRoleDto {
  @ApiProperty({ example: 'Senior Librarian' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Handles book cataloging, issuing, returns, and fine collection' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [PermissionRuleDto],
    example: [
      { resource: 'catalog', actions: ['read', 'create', 'update'] },
      { resource: 'issues', actions: ['read', 'issue', 'return', 'renew'] },
      { resource: 'fines', actions: ['read', 'collect'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionRuleDto)
  permissions: PermissionRuleDto[];
}
