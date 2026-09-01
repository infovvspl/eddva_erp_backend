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
 * Two-tier (view/manage) per resource — matches the source eddva_erp_backend
 * project's RequireErpPermission('transport_management', 'transport.<resource>.<view|manage>')
 * calls exactly, rather than the more granular CRUD-action catalogs used in
 * Front Office/Inventory (this module's source has no finer-grained actions
 * to preserve).
 */
export const TRANSPORT_RESOURCE_CATALOG = [
  {
    resource: 'vehicles',
    name: 'Vehicles',
    description: 'Manage the vehicle fleet',
    available_actions: ['view', 'manage'],
  },
  {
    resource: 'routes',
    name: 'Routes',
    description: 'Manage routes, stops, and route-vehicle assignments',
    available_actions: ['view', 'manage'],
  },
  {
    resource: 'passengers',
    name: 'Passengers',
    description: 'Manage passenger records',
    available_actions: ['view', 'manage'],
  },
  {
    resource: 'allocations',
    name: 'Route Allocations',
    description: 'Allocate passengers to routes/stops',
    available_actions: ['view', 'manage'],
  },
  {
    resource: 'drivers',
    name: 'Drivers',
    description: 'Manage drivers, their compliance documents, and vehicle assignment history',
    available_actions: ['view', 'manage'],
  },
  {
    resource: 'fees',
    name: 'Transport Fees',
    description: 'Manage fee plans, passenger subscriptions, and payments',
    available_actions: ['view', 'manage'],
  },
] as const;

export class TransportPermissionRuleDto {
  @ApiProperty({ example: 'vehicles', description: 'Target resource name' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['view', 'manage'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateTransportDynamicRoleDto {
  @ApiProperty({ example: 'Dispatcher' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Manages routes, vehicle assignments, and passenger allocations' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [TransportPermissionRuleDto],
    example: [
      { resource: 'vehicles', actions: ['view'] },
      { resource: 'routes', actions: ['view', 'manage'] },
      { resource: 'passengers', actions: ['view', 'manage'] },
      { resource: 'allocations', actions: ['view', 'manage'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransportPermissionRuleDto)
  permissions: TransportPermissionRuleDto[];
}
