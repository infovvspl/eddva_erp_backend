import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateSalesPurchaseCustomPermissionDto {
  @ApiProperty({
    example: 'purchase_orders',
    description: 'Target resource key',
  })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Purchase Orders' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Purchase Orders' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting purchase orders to CSV' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSalesPurchaseCustomPermissionDto extends PartialType(
  CreateSalesPurchaseCustomPermissionDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
