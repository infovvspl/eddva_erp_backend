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

export class AlumniPermissionRuleDto {
  @ApiProperty({ example: 'events', description: 'Target resource name' })
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

export class CreateAlumniDynamicRoleDto {
  @ApiProperty({ example: 'Alumni Relations Officer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example:
      'Runs the alumni office: directory, verification, events, jobs, mentorship and campaigns',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [AlumniPermissionRuleDto],
    example: [
      {
        resource: 'alumni',
        actions: ['read', 'create', 'update', 'verify', 'issue_account'],
      },
      { resource: 'events', actions: ['read', 'create', 'update', 'cancel'] },
      { resource: 'donations', actions: ['read', 'create', 'confirm'] },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlumniPermissionRuleDto)
  permissions: AlumniPermissionRuleDto[];
}
