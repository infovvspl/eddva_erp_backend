import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SpPaymentMode } from '@prisma/client';

/** `amount` is intentionally not editable — see UpdatePurchasePaymentDto for the same rationale. */
export class UpdateSalesReceiptDto {
  @ApiPropertyOptional({ example: '2026-09-21' })
  @IsOptional()
  @IsDateString()
  receipt_date?: string;

  @ApiPropertyOptional({ enum: SpPaymentMode })
  @IsOptional()
  @IsEnum(SpPaymentMode)
  mode?: SpPaymentMode;

  @ApiPropertyOptional({ example: 'UPI-REF-4455-CORRECTED' })
  @IsOptional()
  @IsString()
  reference_no?: string;
}
