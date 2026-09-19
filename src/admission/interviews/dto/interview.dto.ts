import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
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
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdmissionInterviewMode,
  AdmissionInterviewStatus,
  AdmissionRecommendation,
} from '@prisma/client';

export class ScheduleInterviewDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  application_id: number;

  @ApiProperty({ example: '2027-03-05T10:00:00.000Z' })
  @IsDateString()
  scheduled_datetime: string;

  @ApiProperty({ enum: AdmissionInterviewMode })
  @IsEnum(AdmissionInterviewMode)
  mode: AdmissionInterviewMode;

  @ApiProperty({
    example: 'Room 12, Admin Block',
    description: 'Venue (offline) or meeting link (online)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  venue_or_link: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'eddva_user_ids of the evaluators on the panel. When a panel is set, only its members can evaluate.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  panelist_ids?: string[];
}

export class RescheduleInterviewDto {
  @ApiPropertyOptional({ example: '2027-03-06T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduled_datetime?: string;

  @ApiPropertyOptional({ enum: AdmissionInterviewMode })
  @IsOptional()
  @IsEnum(AdmissionInterviewMode)
  mode?: AdmissionInterviewMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  venue_or_link?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Replaces the panel when provided',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  panelist_ids?: string[];
}

export class UpdateInterviewStatusDto {
  @ApiProperty({ enum: ['completed', 'no_show'] })
  @IsEnum(AdmissionInterviewStatus)
  status: AdmissionInterviewStatus;
}

export class EvaluateInterviewDto {
  @ApiProperty({ example: 82.5, description: '0–100' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional({ example: 'Confident, strong reasoning' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @ApiProperty({ enum: AdmissionRecommendation })
  @IsEnum(AdmissionRecommendation)
  recommendation: AdmissionRecommendation;
}

export class QueryInterviewDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: AdmissionInterviewStatus })
  @IsOptional()
  @IsEnum(AdmissionInterviewStatus)
  status?: AdmissionInterviewStatus;

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

  @ApiPropertyOptional({
    description: 'Only interviews where I am on the panel',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  mine?: boolean;

  @ApiPropertyOptional({
    example: '2027-03-01',
    description: 'scheduled_datetime >=',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description: 'scheduled_datetime <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['scheduled_datetime', 'created_at'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
