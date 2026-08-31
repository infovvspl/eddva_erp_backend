import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateInventoryCustomPermissionDto {
  @ApiProperty({ example: 'stock', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Stock Ledger' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Stock Register' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting the stock ledger to CSV' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateInventoryCustomPermissionDto extends PartialType(CreateInventoryCustomPermissionDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
