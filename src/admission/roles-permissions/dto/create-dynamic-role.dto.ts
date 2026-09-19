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

export class AdmissionPermissionRuleDto {
  @ApiProperty({ example: 'applications', description: 'Target resource name' })
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

export class CreateAdmissionDynamicRoleDto {
  @ApiProperty({ example: 'Admission Officer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'Handles enquiries, applications and document verification',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    type: [AdmissionPermissionRuleDto],
    example: [
      {
        resource: 'enquiries',
        actions: ['read', 'create', 'update', 'followup', 'convert'],
      },
      {
        resource: 'applications',
        actions: ['read', 'create', 'update', 'review'],
      },
      {
        resource: 'documents',
        actions: ['read', 'upload', 'verify', 'reject'],
      },
    ],
    description: 'Dynamic Permission Matrix rules array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdmissionPermissionRuleDto)
  permissions: AdmissionPermissionRuleDto[];
}
