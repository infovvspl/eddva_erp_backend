import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCanteenCustomPermissionDto {
  @ApiProperty({
    example: 'orders',
    description: 'Target resource key',
  })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Orders' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Orders' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting orders to CSV' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCanteenCustomPermissionDto extends PartialType(
  CreateCanteenCustomPermissionDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
