import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdmissionFeePaymentStatus,
  AdmissionPaymentMode,
} from '@prisma/client';
import { MAX_AMOUNT } from '../../common/validation';

export class PayApplicationFeeDto {
  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ example: '2027-01-15' })
  @IsDateString()
  payment_date: string;

  @ApiProperty({ enum: AdmissionPaymentMode })
  @IsEnum(AdmissionPaymentMode)
  payment_mode: AdmissionPaymentMode;

  @ApiPropertyOptional({
    example: 'UPI-9081726354',
    description: 'Required for a successful non-cash payment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transaction_ref?: string;

  @ApiProperty({
    enum: AdmissionFeePaymentStatus,
    description:
      'The outcome being recorded. There is no payment gateway — this is a staff-recorded payment, so the status is supplied, never assumed.',
  })
  @IsEnum(AdmissionFeePaymentStatus)
  status: AdmissionFeePaymentStatus;

  @ApiPropertyOptional({
    description:
      'Client-generated key; replaying the same key returns the original payment instead of a duplicate',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotency_key?: string;
}

export class UpdateApplicationFeePaymentDto {
  @ApiProperty({
    enum: ['success', 'failed'],
    description: 'Settle a pending payment',
  })
  @IsEnum(AdmissionFeePaymentStatus)
  status: AdmissionFeePaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transaction_ref?: string;
}
