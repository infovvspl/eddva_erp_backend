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

export class CreateSalesInvoiceItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  item_id: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Links this line to a sales order item for order-quantity matching',
  })
  @IsOptional()
  @IsInt()
  so_item_id?: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 280 })
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

export class CreateSalesInvoiceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  customer_id: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  sales_order_id?: number;

  @ApiProperty({ example: '2026-09-16' })
  @IsDateString()
  invoice_date: string;

  @ApiPropertyOptional({ example: '2026-10-16' })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreateSalesInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items: CreateSalesInvoiceItemDto[];
}
