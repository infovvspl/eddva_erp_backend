import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGrnItemDto {
  @ApiProperty({
    example: 1,
    description: 'sp_purchase_order_items.po_item_id being received against',
  })
  @IsInt()
  po_item_id: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0.001)
  received_qty: number;

  @ApiProperty({ example: 9 })
  @IsNumber()
  @Min(0)
  accepted_qty: number;

  @ApiProperty({
    example: 1,
    description: 'Damaged/short quantity rejected at receipt',
  })
  @IsNumber()
  @Min(0)
  rejected_qty: number;
}

export class CreateGrnDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  purchase_order_id: number;

  @ApiProperty({ example: '2026-09-20' })
  @IsDateString()
  received_date: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  warehouse_id: number;

  @ApiProperty({ type: [CreateGrnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGrnItemDto)
  items: CreateGrnItemDto[];
}
