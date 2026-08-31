import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePurchaseDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  item_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendor_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  location_id: number;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 45.5 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unit_price: number;

  @ApiPropertyOptional({ example: 'INV-2026-00123' })
  @IsOptional()
  @IsString()
  invoice_number?: string;

  @ApiProperty({ example: '2026-08-29' })
  @IsDateString()
  purchase_date: string;

  @ApiPropertyOptional({
    description: 'Required when the item is item_type=asset — one asset unit is created per unit purchased, tagged sequentially unless asset_tags is supplied',
    type: [String],
    example: ['LAPTOP-0001', 'LAPTOP-0002'],
  })
  @IsOptional()
  asset_tags?: string[];
}
