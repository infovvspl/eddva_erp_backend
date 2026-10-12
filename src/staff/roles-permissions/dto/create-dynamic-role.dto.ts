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

export class StaffPermissionRuleDto {
  @ApiProperty({ example: 'staff_members', description: 'Target resource name' })
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

export class CreateStaffDynamicRoleDto {
  @ApiProperty({ example: 'HR Officer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'Manages the staff directory and departments',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [StaffPermissionRuleDto],
    example: [
      { resource: 'departments', actions: ['read', 'create', 'update'] },
      {
        resource: 'staff_members',
        actions: ['read', 'create', 'update', 'relieve', 'reinstate'],
      },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffPermissionRuleDto)
  permissions: StaffPermissionRuleDto[];
}
