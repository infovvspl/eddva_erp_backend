import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SpPaymentMode } from '@prisma/client';

/**
 * `amount` is intentionally not editable here — changing it requires
 * reversing and re-validating against the invoice's outstanding balance
 * under the same concurrency-safe guard used on create. Correct the amount
 * by deleting and re-recording the payment instead.
 */
export class UpdatePurchasePaymentDto {
  @ApiPropertyOptional({ example: '2026-09-26' })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional({ enum: SpPaymentMode })
  @IsOptional()
  @IsEnum(SpPaymentMode)
  mode?: SpPaymentMode;

  @ApiPropertyOptional({ example: 'UTR-887766-CORRECTED' })
  @IsOptional()
  @IsString()
  reference_no?: string;
}
