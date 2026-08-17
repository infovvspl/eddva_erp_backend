import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class CreateSalesInvoiceItemDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 600.0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 'taxcode-uuid' })
  @IsUUID()
  @IsNotEmpty()
  taxCodeId: string;
}

export class CreateSalesInvoiceDto {
  @ApiProperty({ example: 'customer-uuid' })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiPropertyOptional({ example: 'so-uuid' })
  @IsOptional()
  @IsUUID()
  soId?: string;

  @ApiProperty({ example: '2026-08-11T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  invoiceDate: Date;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreateSalesInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceItemDto)
  items: CreateSalesInvoiceItemDto[];
}

export class UpdateSalesInvoiceDto extends PartialType(CreateSalesInvoiceDto) {}

export class CreateSalesReceiptDto {
  @ApiProperty({ example: 'sales-invoice-uuid' })
  @IsUUID()
  @IsNotEmpty()
  salesInvoiceId: string;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  receiptDate: Date;

  @ApiProperty({ example: 3500.0 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: PaymentMode, example: PaymentMode.UPI })
  @IsEnum(PaymentMode)
  mode: PaymentMode;

  @ApiPropertyOptional({ example: 'UPI987654321' })
  @IsOptional()
  @IsString()
  referenceNo?: string;
}

export class UpdateSalesReceiptDto extends PartialType(CreateSalesReceiptDto) {}
