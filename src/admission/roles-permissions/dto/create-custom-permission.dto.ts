import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAdmissionCustomPermissionDto {
  @ApiProperty({ example: 'applications', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Applications' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Applications' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting applications' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateAdmissionCustomPermissionDto extends PartialType(
  CreateAdmissionCustomPermissionDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
