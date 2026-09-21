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

export class HostelPermissionRuleDto {
  @ApiProperty({ example: 'gate_passes', description: 'Target resource name' })
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

export class CreateHostelDynamicRoleDto {
  @ApiProperty({ example: 'Warden' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example:
      'Runs day-to-day hostel operations: allotments, gate passes, roll call and complaints',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [HostelPermissionRuleDto],
    example: [
      {
        resource: 'residents',
        actions: ['read', 'create', 'update', 'suspend'],
      },
      {
        resource: 'allotments',
        actions: ['read', 'create', 'vacate', 'transfer'],
      },
      {
        resource: 'gate_passes',
        actions: ['read', 'create', 'approve', 'scan'],
      },
      { resource: 'attendance', actions: ['read', 'mark', 'update'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HostelPermissionRuleDto)
  permissions: HostelPermissionRuleDto[];
}
