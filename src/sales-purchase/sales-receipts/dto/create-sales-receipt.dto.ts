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

export class CreateSalesReceiptDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  si_id: number;

  @ApiProperty({ example: '2026-09-20' })
  @IsDateString()
  receipt_date: string;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: SpPaymentMode, example: SpPaymentMode.UPI })
  @IsEnum(SpPaymentMode)
  mode: SpPaymentMode;

  @ApiPropertyOptional({ example: 'UPI-REF-4455' })
  @IsOptional()
  @IsString()
  reference_no?: string;
}
