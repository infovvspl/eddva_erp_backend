import {
  ArrayMaxSize,
  ArrayNotEmpty,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  AdmissionTestMode,
  AdmissionTestRegistrationStatus,
} from '@prisma/client';

export class CreateEntranceTestDto {
  @ApiProperty({ example: 'Grade 5 Entrance Test — Round 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

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

  @ApiProperty({ example: '2027-02-20T09:30:00.000Z' })
  @IsDateString()
  test_date: string;

  @ApiProperty({ enum: AdmissionTestMode })
  @IsEnum(AdmissionTestMode)
  mode: AdmissionTestMode;

  @ApiPropertyOptional({
    example: 'Main Hall, Block A',
    description:
      'Required for offline tests; a link/instructions for online tests',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  venue?: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999.99)
  max_marks: number;
}

export class UpdateEntranceTestDto extends PartialType(CreateEntranceTestDto) {}

export class QueryEntranceTestDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Matches test name or venue' })
  @IsOptional()
  @IsString()
  search?: string;

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

  @ApiPropertyOptional({ enum: AdmissionTestMode })
  @IsOptional()
  @IsEnum(AdmissionTestMode)
  mode?: AdmissionTestMode;

  @ApiPropertyOptional({ example: '2027-02-01', description: 'test_date >=' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-02-28',
    description: 'test_date <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['test_date', 'name', 'created_at'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class RegisterApplicantsDto {
  @ApiProperty({
    type: [Number],
    example: [1, 2, 3],
    description:
      'Applications to register. All-or-nothing: one invalid application rejects the whole batch.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  application_ids: number[];
}

export class UpdateRegistrationDto {
  @ApiProperty({ enum: ['appeared', 'absent'] })
  @IsEnum(AdmissionTestRegistrationStatus)
  status: AdmissionTestRegistrationStatus;
}

export class ResultEntryDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  application_id: number;

  @ApiProperty({ example: 78.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  marks_obtained: number;
}

export class RecordResultsDto {
  @ApiProperty({ type: [ResultEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ResultEntryDto)
  results: ResultEntryDto[];
}
