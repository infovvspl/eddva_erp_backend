import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  HostelBillingCycle,
  HostelInvoicePaymentStatus,
  HostelPaymentMode,
  HostelRoomType,
} from '@prisma/client';
import { DateRangeQueryDto, PageQueryDto } from '../../common/page-query.dto';
import { MAX_AMOUNT } from '../../common/validation';
import { ToBoolean } from '../../common/transforms';

// ─── Fee plans ──────────────────────────────────────────────────────────────

export class CreateHostelFeePlanDto {
  @ApiProperty({ example: 'Double room with mess — monthly' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: HostelRoomType, example: 'double' })
  @IsEnum(HostelRoomType)
  room_type: HostelRoomType;

  @ApiProperty({
    example: true,
    description: 'Mess charges are bundled into the amount',
  })
  @IsBoolean()
  includes_mess: boolean;

  @ApiProperty({
    example: 6500,
    description: 'Amount per billing cycle (max 2 decimals)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ enum: HostelBillingCycle, example: 'monthly' })
  @IsEnum(HostelBillingCycle)
  billing_cycle: HostelBillingCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHostelFeePlanDto extends PartialType(
  CreateHostelFeePlanDto,
) {}

export class QueryHostelFeePlanDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: HostelRoomType })
  @IsOptional()
  @IsEnum(HostelRoomType)
  room_type?: HostelRoomType;

  @ApiPropertyOptional({ enum: HostelBillingCycle })
  @IsOptional()
  @IsEnum(HostelBillingCycle)
  billing_cycle?: HostelBillingCycle;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includes_mess?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  is_active?: boolean;
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export class GenerateHostelInvoiceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  fee_plan_id: number;

  @ApiProperty({
    example: '2026-09-01',
    description:
      'First day of the period: 1st of a month (monthly), 1st of Jan/Apr/Jul/Oct (quarterly), 1st of any month (annual)',
  })
  @IsString()
  billing_period_start: string;

  @ApiPropertyOptional({
    example: '2026-09-10',
    description: 'Default: 10 days after the period starts',
  })
  @IsOptional()
  @IsString()
  due_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class CancelHostelInvoiceDto {
  @ApiProperty({ example: 'Generated for the wrong period' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class QueryHostelInvoiceDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional({ enum: HostelInvoicePaymentStatus })
  @IsOptional()
  @IsEnum(HostelInvoicePaymentStatus)
  payment_status?: HostelInvoicePaymentStatus;

  @ApiPropertyOptional({
    example: '2026-09',
    description: 'Exact billing period label',
  })
  @IsOptional()
  @IsString()
  billing_period?: string;

  @ApiPropertyOptional({ enum: HostelBillingCycle })
  @IsOptional()
  @IsEnum(HostelBillingCycle)
  billing_cycle?: HostelBillingCycle;

  @ApiPropertyOptional({ description: 'Residents currently in this block' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;

  @ApiPropertyOptional({
    description: 'Include cancelled invoices (default false)',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  include_cancelled?: boolean;
}

// ─── Payments ───────────────────────────────────────────────────────────────

export class RecordHostelPaymentDto {
  @ApiProperty({
    example: 6500,
    description: 'Must be > 0 and no more than the outstanding balance',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount_paid: number;

  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'Default today; cannot be in the future',
  })
  @IsOptional()
  @IsString()
  payment_date?: string;

  @ApiProperty({ enum: HostelPaymentMode, example: 'upi' })
  @IsEnum(HostelPaymentMode)
  payment_mode: HostelPaymentMode;

  @ApiPropertyOptional({
    example: 'UPI-8842913',
    description: 'Required for card, upi and bank_transfer',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  transaction_ref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class QueryHostelPaymentDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  invoice_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional({ enum: HostelPaymentMode })
  @IsOptional()
  @IsEnum(HostelPaymentMode)
  payment_mode?: HostelPaymentMode;
}
