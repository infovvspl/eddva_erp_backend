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

export const SPORTS_RESOURCE_CATALOG = [
  {
    resource: 'sports',
    name: 'Sports Catalog',
    description: 'Manage sports list (Football, Athletics, Chess, etc.)',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'houses',
    name: 'House Management',
    description: 'Manage houses, memberships, point ledger, and standings',
    available_actions: ['read', 'create', 'update', 'delete', 'award_points'],
  },
  {
    resource: 'tournaments',
    name: 'Tournaments',
    description: 'Create and manage inter-house / inter-school tournaments & teams',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'fixtures',
    name: 'Fixtures & Scoring',
    description: 'Schedule match fixtures, record match scores and player stats',
    available_actions: ['read', 'create', 'update', 'delete', 'record_result'],
  },
  {
    resource: 'records',
    name: 'Sports Records',
    description: 'Track personal bests, tournament wins, milestones, and school records',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'awards',
    name: 'Awards & Medals',
    description: 'Issue certificates, medals, and trophies for tournaments',
    available_actions: ['read', 'create', 'delete'],
  },
  {
    resource: 'venues',
    name: 'Venues',
    description: 'Manage grounds, courts, pools, and halls',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'staff',
    name: 'Sports Staff',
    description: 'Manage coaches, house masters, and officials',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
  {
    resource: 'participants',
    name: 'Student Participants',
    description: 'Manage student athlete profiles',
    available_actions: ['read', 'create', 'update', 'delete'],
  },
] as const;

export class SportsPermissionRuleDto {
  @ApiProperty({ example: 'houses', description: 'Target resource name' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({
    example: ['read', 'award_points'],
    description: 'List of allowed action keys on this resource',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  actions: string[];
}

export class CreateSportsDynamicRoleDto {
  @ApiProperty({ example: 'Head Coach' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Manages teams, match fixtures, and results' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [SportsPermissionRuleDto],
    example: [
      { resource: 'houses', actions: ['read', 'award_points'] },
      { resource: 'tournaments', actions: ['read', 'create', 'update'] },
      { resource: 'fixtures', actions: ['read', 'create', 'record_result'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SportsPermissionRuleDto)
  permissions: SportsPermissionRuleDto[];
}
