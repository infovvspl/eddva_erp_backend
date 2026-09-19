import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdmissionPaymentMode } from '@prisma/client';
import { MAX_AMOUNT } from '../../common/validation';

export class CreateFeeStructureDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id: number;

  @ApiProperty({
    example: 25000,
    description: '0 is allowed: a program with no admission fee',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ example: '2027-04-30' })
  @IsDateString()
  due_date: string;
}

export class UpdateFeeStructureDto {
  @ApiPropertyOptional({ example: 26000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  amount?: number;

  @ApiPropertyOptional({ example: '2027-05-15' })
  @IsOptional()
  @IsDateString()
  due_date?: string;
}

export class QueryFeeStructureDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  program_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;
}

export class PayAdmissionFeeDto {
  @ApiProperty({ example: 25000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount_paid: number;

  @ApiProperty({ example: '2027-04-12' })
  @IsDateString()
  payment_date: string;

  @ApiProperty({ enum: AdmissionPaymentMode })
  @IsEnum(AdmissionPaymentMode)
  payment_mode: AdmissionPaymentMode;

  @ApiPropertyOptional({
    example: 'NEFT-778812',
    description: 'Required for every non-cash payment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transaction_ref?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated key; replaying it returns the original payment instead of recording a second one',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotency_key?: string;
}

export class QueryAdmissionPaymentDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  application_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  program_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  session_id?: number;

  @ApiPropertyOptional({ enum: AdmissionPaymentMode })
  @IsOptional()
  @IsEnum(AdmissionPaymentMode)
  payment_mode?: AdmissionPaymentMode;

  @ApiPropertyOptional({
    description:
      'Matches receipt number, transaction reference, application number, applicant name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2027-04-01',
    description: 'payment_date >=',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-04-30',
    description: 'payment_date <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;
}
