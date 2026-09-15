import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseInvoiceItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  item_id: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Links this line to a PO item for three-way matching',
  })
  @IsOptional()
  @IsInt()
  po_item_id?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Links this line to a GRN item for three-way matching',
  })
  @IsOptional()
  @IsInt()
  grn_item_id?: number;

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

export class CreatePurchaseInvoiceDto {
  @ApiProperty({ example: 'VEND-INV-98123' })
  @IsString()
  @IsNotEmpty()
  vendor_invoice_number: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  purchase_order_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  grn_id?: number;

  @ApiProperty({ example: '2026-09-22' })
  @IsDateString()
  invoice_date: string;

  @ApiPropertyOptional({ example: '2026-10-22' })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreatePurchaseInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items: CreatePurchaseInvoiceItemDto[];
}
