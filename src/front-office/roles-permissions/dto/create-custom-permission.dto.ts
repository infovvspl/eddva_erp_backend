import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateFrontOfficeCustomPermissionDto {
  @ApiProperty({ example: 'visitors', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Visitor Log' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Visitor Register' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting the visitor log to CSV' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateFrontOfficeCustomPermissionDto extends PartialType(CreateFrontOfficeCustomPermissionDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
