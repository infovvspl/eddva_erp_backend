import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const MAX_AMOUNT = 99_999_999.99;
const PAYMENT_MODES = ['cash', 'card', 'upi', 'bank_transfer', 'online'] as const;

export class RecordFeePaymentDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  student_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  structure_id: number;

  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount_paid: number;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  payment_date: string;

  @ApiProperty({ enum: PAYMENT_MODES })
  @IsIn(PAYMENT_MODES)
  payment_mode: (typeof PAYMENT_MODES)[number];

  @ApiPropertyOptional({ example: 'NEFT-778812', description: 'Required for every non-cash payment' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transaction_ref?: string;
}

export class QueryFeePaymentDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  student_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  class_id?: number;

  @ApiPropertyOptional({ example: '2026-27' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;
}
