import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  item_id: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 220.5 })
  @IsNumber()
  @Min(0)
  unit_price: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tax_code_id?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  line_discount?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  po_date: string;

  @ApiPropertyOptional({ example: '2026-09-25' })
  @IsOptional()
  @IsDateString()
  expected_delivery_date?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  warehouse_id: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Order-level flat discount, applied on top of line discounts',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
