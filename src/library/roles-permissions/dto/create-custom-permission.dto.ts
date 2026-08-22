import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCustomPermissionDto {
  @ApiProperty({ example: 'catalog', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Book Catalog CSV' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Catalog & Books' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting book catalog to CSV/Excel' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCustomPermissionDto extends PartialType(CreateCustomPermissionDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
