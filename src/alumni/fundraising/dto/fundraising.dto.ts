import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import {
  AlumniCampaignStatus,
  AlumniDonationPaymentMode,
  AlumniDonationStatus,
} from '@prisma/client';
import { DateRangeQueryDto, PageQueryDto } from '../../common/page-query.dto';
import { DATE_ONLY_REGEX } from '../../common/time.util';
import { ToBoolean, Trim } from '../../common/transforms';
import { MAX_AMOUNT } from '../../common/validation';

const DATE_MESSAGE = 'must be a date in YYYY-MM-DD format';

export class CreateCampaignDto {
  @ApiProperty({ example: 'New Library Wing' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 1000000, description: 'Fundraising goal (> 0)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999999999999.99)
  goal_amount: number;

  @ApiProperty({ example: '2026-10-01' })
  @Matches(DATE_ONLY_REGEX, { message: `start_date ${DATE_MESSAGE}` })
  start_date: string;

  @ApiProperty({ example: '2027-03-31' })
  @Matches(DATE_ONLY_REGEX, { message: `end_date ${DATE_MESSAGE}` })
  end_date: string;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999999999999.99)
  goal_amount?: number;

  @ApiPropertyOptional({
    description: 'Extending a completed campaign re-activates it',
  })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: `end_date ${DATE_MESSAGE}` })
  end_date?: string;
}

export class QueryCampaignDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniCampaignStatus })
  @IsOptional()
  @IsEnum(AlumniCampaignStatus)
  status?: AlumniCampaignStatus;
}

export class CreateDonationDto {
  @ApiPropertyOptional({
    description:
      'Staff: the donor (required). Alumni always donate as themselves',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;

  @ApiPropertyOptional({
    description: 'Omit for a general / unrestricted donation',
  })
  @IsOptional()
  @IsInt()
  campaign_id?: number;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ enum: AlumniDonationPaymentMode, example: 'upi' })
  @IsEnum(AlumniDonationPaymentMode)
  payment_mode: AlumniDonationPaymentMode;

  @ApiPropertyOptional({
    example: 'UPI-991823',
    description:
      'Bank / gateway / cheque reference. For alumni this is an unverified claim until staff confirm the money arrived',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  transaction_ref?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Hide the donor identity in public-facing views',
  })
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Staff with the confirm permission only: record the donation as already received (needs transaction_ref); a receipt is issued immediately',
  })
  @IsOptional()
  @IsBoolean()
  mark_received?: boolean;

  @ApiPropertyOptional({
    description:
      'Staff, with mark_received: when the money was received (default now)',
  })
  @IsOptional()
  @IsDateString()
  received_on?: string;
}

export class ConfirmDonationDto {
  @ApiPropertyOptional({
    description: 'Required if the donation has no reference yet',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  transaction_ref?: string;

  @ApiPropertyOptional({ enum: AlumniDonationPaymentMode })
  @IsOptional()
  @IsEnum(AlumniDonationPaymentMode)
  payment_mode?: AlumniDonationPaymentMode;

  @ApiPropertyOptional({
    description: 'When the money was received (default now; not in the future)',
  })
  @IsOptional()
  @IsDateString()
  received_on?: string;
}

export class DonationReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReverseDonationDto {
  @ApiProperty({ example: 'Cheque bounced' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class QueryDonationDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  campaign_id?: number;

  @ApiPropertyOptional({
    description: 'Staff only; alumni always see just their own',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;

  @ApiPropertyOptional({ enum: AlumniDonationStatus })
  @IsOptional()
  @IsEnum(AlumniDonationStatus)
  status?: AlumniDonationStatus;

  @ApiPropertyOptional({ enum: AlumniDonationPaymentMode })
  @IsOptional()
  @IsEnum(AlumniDonationPaymentMode)
  payment_mode?: AlumniDonationPaymentMode;

  @ApiPropertyOptional({ description: 'Only general (no campaign) donations' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  general_only?: boolean;
}

export class ReceiptQueryDto {
  @ApiPropertyOptional({ enum: ['json', 'pdf'], default: 'json' })
  @IsOptional()
  @IsString()
  format?: 'json' | 'pdf';
}
