import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAlumniCustomPermissionDto {
  @ApiProperty({ example: 'events', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Events' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Alumni Events' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting event records' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateAlumniCustomPermissionDto extends PartialType(
  CreateAlumniCustomPermissionDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
