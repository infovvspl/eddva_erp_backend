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

export class CreatePurchaseInvoiceItemDto {
  @ApiProperty({ example: 'item-uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 500.0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 'taxcode-uuid' })
  @IsUUID()
  @IsNotEmpty()
  taxCodeId: string;
}

export class CreatePurchaseInvoiceDto {
  @ApiProperty({ example: 'INV-VEN-9876' })
  @IsString()
  @IsNotEmpty()
  vendorInvoiceNumber: string;

  @ApiProperty({ example: 'vendor-uuid' })
  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @ApiPropertyOptional({ example: 'po-uuid' })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional({ example: 'grn-uuid' })
  @IsOptional()
  @IsUUID()
  grnId?: string;

  @ApiProperty({ example: '2026-08-12T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  invoiceDate: Date;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreatePurchaseInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceItemDto)
  items: CreatePurchaseInvoiceItemDto[];
}

export class UpdatePurchaseInvoiceDto extends PartialType(CreatePurchaseInvoiceDto) {}

export class CreatePurchasePaymentDto {
  @ApiProperty({ example: 'purchase-invoice-uuid' })
  @IsUUID()
  @IsNotEmpty()
  purchaseInvoiceId: string;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  paymentDate: Date;

  @ApiProperty({ example: 2500.0 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: PaymentMode, example: PaymentMode.BANK_TRANSFER })
  @IsEnum(PaymentMode)
  mode: PaymentMode;

  @ApiPropertyOptional({ example: 'UTR123456789' })
  @IsOptional()
  @IsString()
  referenceNo?: string;
}

export class UpdatePurchasePaymentDto extends PartialType(CreatePurchasePaymentDto) {}
