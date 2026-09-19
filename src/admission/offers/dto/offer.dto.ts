import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdmissionOfferStatus } from '@prisma/client';

export class IssueOfferDto {
  @ApiProperty({
    example: '2027-04-10T18:00:00.000Z',
    description:
      'Hard expiry. After this instant the offer can no longer be accepted.',
  })
  @IsDateString()
  offer_expiry_date: string;

  @ApiProperty({ example: 'General' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  seat_category: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  offer_date?: string;
}

export class DeclineOfferDto {
  @ApiPropertyOptional({ example: 'Family relocating' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class QueryOfferDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: AdmissionOfferStatus })
  @IsOptional()
  @IsEnum(AdmissionOfferStatus)
  status?: AdmissionOfferStatus;

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
    description: 'Outstanding offers that expire within this many days',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiring_within_days?: number;

  @ApiPropertyOptional({
    description: 'Matches application number or applicant name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '2027-03-01', description: 'offer_date >=' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description: 'offer_date <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['offer_date', 'offer_expiry_date', 'created_at'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
