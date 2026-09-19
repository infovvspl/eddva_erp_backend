import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdmissionMeritOutcome } from '@prisma/client';

export class MeritEntryDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  application_id: number;

  @ApiProperty({ example: 1, description: 'Unique within the list' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rank: number;

  @ApiProperty({
    example: 'General',
    description: 'Free text: e.g. General, Reserved',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category: string;

  @ApiProperty({ enum: AdmissionMeritOutcome })
  @IsEnum(AdmissionMeritOutcome)
  outcome: AdmissionMeritOutcome;
}

export class CreateMeritListDto {
  @ApiPropertyOptional({ example: 'Round 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id: number;

  @ApiProperty({ example: '60% entrance test, 40% interview' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  criteria_description: string;

  @ApiPropertyOptional({ type: [MeritEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MeritEntryDto)
  entries?: MeritEntryDto[];
}

export class UpdateMeritListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  criteria_description?: string;
}

export class ReplaceMeritEntriesDto {
  @ApiProperty({
    type: [MeritEntryDto],
    description: 'Replaces every entry of a draft list',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MeritEntryDto)
  entries: MeritEntryDto[];
}

export class QueryMeritListDto {
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
  session_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  program_id?: number;

  @ApiPropertyOptional({
    description: 'true = published only, false = drafts only',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({ enum: ['created_at', 'published_date'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
