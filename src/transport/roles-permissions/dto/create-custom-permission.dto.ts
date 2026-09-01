import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateTransportCustomPermissionDto {
  @ApiProperty({ example: 'vehicles', description: 'Target resource key' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'export', description: 'Action key' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Export Fleet Report' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Vehicles' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'Allows exporting the fleet list to CSV' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTransportCustomPermissionDto extends PartialType(CreateTransportCustomPermissionDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
