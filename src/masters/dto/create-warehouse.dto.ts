import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Central Warehouse' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '123 Logistics Park, City' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
