import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AlumniAttendanceStatus,
  AlumniEventMode,
  AlumniEventPaymentMode,
  AlumniEventPaymentStatus,
  AlumniEventStatus,
  AlumniEventType,
} from '@prisma/client';
import { DateRangeQueryDto, PageQueryDto } from '../../common/page-query.dto';
import { ToBoolean, Trim } from '../../common/transforms';
import { HTTP_URL_OPTIONS, MAX_AMOUNT } from '../../common/validation';

export class CreateEventDto {
  @ApiProperty({ example: 'Class of 2015 Reunion' })
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

  @ApiProperty({ enum: AlumniEventType, example: 'reunion' })
  @IsEnum(AlumniEventType)
  event_type: AlumniEventType;

  @ApiProperty({ enum: AlumniEventMode, example: 'offline' })
  @IsEnum(AlumniEventMode)
  mode: AlumniEventMode;

  @ApiPropertyOptional({ description: 'Required for offline / hybrid events' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  venue?: string;

  @ApiPropertyOptional({
    description: 'Required for online / hybrid events (http/https)',
  })
  @IsOptional()
  @Trim()
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(500)
  online_link?: string;

  @ApiProperty({
    example: '2026-12-20T10:00:00.000Z',
    description: 'Must be in the future',
  })
  @IsDateString()
  event_date: string;

  @ApiPropertyOptional({
    description: 'Defaults to a day after event_date for status purposes',
  })
  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional({
    description:
      'Last moment to register (must not be after event_date). Defaults to event_date',
  })
  @IsOptional()
  @IsDateString()
  registration_deadline?: string;

  @ApiPropertyOptional({
    example: 100,
    description: 'Omit for unlimited capacity',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_capacity?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_paid?: boolean;

  @ApiPropertyOptional({
    example: 500,
    description: 'Required (> 0) for paid events, forbidden otherwise',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99999999.99)
  ticket_price?: number;
}

export class UpdateEventDto {
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

  @ApiPropertyOptional({ enum: AlumniEventType })
  @IsOptional()
  @IsEnum(AlumniEventType)
  event_type?: AlumniEventType;

  @ApiPropertyOptional({ enum: AlumniEventMode })
  @IsOptional()
  @IsEnum(AlumniEventMode)
  mode?: AlumniEventMode;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  venue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(500)
  online_link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  event_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registration_deadline?: string;

  @ApiPropertyOptional({
    description: 'Cannot drop below the current number of registrations',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_capacity?: number;

  @ApiPropertyOptional({ description: 'Locked once anyone has registered' })
  @IsOptional()
  @IsBoolean()
  is_paid?: boolean;

  @ApiPropertyOptional({ description: 'Locked once anyone has registered' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99999999.99)
  ticket_price?: number;
}

export class QueryEventDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: AlumniEventType })
  @IsOptional()
  @IsEnum(AlumniEventType)
  event_type?: AlumniEventType;

  @ApiPropertyOptional({ enum: AlumniEventMode })
  @IsOptional()
  @IsEnum(AlumniEventMode)
  mode?: AlumniEventMode;

  @ApiPropertyOptional({ enum: AlumniEventStatus })
  @IsOptional()
  @IsEnum(AlumniEventStatus)
  status?: AlumniEventStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  is_paid?: boolean;

  @ApiPropertyOptional({
    description: 'Only events still open for registration',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  registration_open?: boolean;
}

export class CancelEventDto {
  @ApiPropertyOptional({ example: 'Venue unavailable' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RegisterForEventDto {
  @ApiPropertyOptional({
    description:
      'Staff registering an alumnus on their behalf (required for staff, ignored for alumni who always register themselves)',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;
}

export class CancelRegistrationDto {
  @ApiPropertyOptional({
    description:
      'Staff cancelling on behalf of an alumnus (required for staff)',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;
}

export class AttendanceRecordDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  registration_id: number;

  @ApiProperty({
    enum: ['registered', 'attended', 'no_show'],
    example: 'attended',
  })
  @IsIn(['registered', 'attended', 'no_show'])
  status: 'registered' | 'attended' | 'no_show';
}

export class MarkEventAttendanceDto {
  @ApiProperty({
    type: [AttendanceRecordDto],
    description: 'One or many (max 500); all-or-nothing',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

export class QueryRegistrationDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniAttendanceStatus })
  @IsOptional()
  @IsEnum(AlumniAttendanceStatus)
  attendance_status?: AlumniAttendanceStatus;

  @ApiPropertyOptional({ enum: AlumniEventPaymentStatus })
  @IsOptional()
  @IsEnum(AlumniEventPaymentStatus)
  payment_status?: AlumniEventPaymentStatus;

  @ApiPropertyOptional({ description: 'Global list only' })
  @IsOptional()
  @IsInt()
  event_id?: number;

  @ApiPropertyOptional({
    description: 'Staff only; alumni always see just their own',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;
}

export class RecordEventPaymentDto {
  @ApiProperty({
    example: 500,
    description: 'Must equal the ticket price captured at registration',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ enum: AlumniEventPaymentMode, example: 'upi' })
  @IsEnum(AlumniEventPaymentMode)
  payment_mode: AlumniEventPaymentMode;

  @ApiProperty({
    example: 'UPI-8842931',
    description: 'Bank / gateway reference of the payment',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  transaction_ref: string;

  @ApiPropertyOptional({
    description: 'When the money was received (default now; not in the future)',
  })
  @IsOptional()
  @IsDateString()
  paid_at?: string;
}
