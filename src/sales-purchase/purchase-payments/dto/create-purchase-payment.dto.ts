import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SpPaymentMode } from '@prisma/client';

export class CreatePurchasePaymentDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  pi_id: number;

  @ApiProperty({ example: '2026-09-25' })
  @IsDateString()
  payment_date: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: SpPaymentMode, example: SpPaymentMode.BANK_TRANSFER })
  @IsEnum(SpPaymentMode)
  mode: SpPaymentMode;

  @ApiPropertyOptional({ example: 'UTR-887766' })
  @IsOptional()
  @IsString()
  reference_no?: string;
}
