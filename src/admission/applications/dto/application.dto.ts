import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdmissionApplicationStatus } from '@prisma/client';
import { CreateApplicantDto } from '../../applicants/dto/applicant.dto';

export class CreateApplicationDto {
  @ApiPropertyOptional({
    description:
      'Existing applicant. Provide exactly one of applicant_id or applicant.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicant_id?: number;

  @ApiPropertyOptional({
    type: CreateApplicantDto,
    description:
      'New applicant. If the same person already exists (same name + phone/email [+ dob]) that record is reused instead of creating a duplicate.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateApplicantDto)
  applicant?: CreateApplicantDto;

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

  @ApiPropertyOptional({
    example: '2027-01-15',
    description: 'Defaults to today',
  })
  @IsOptional()
  @IsDateString()
  application_date?: string;

  @ApiPropertyOptional({
    description:
      'Optional. Links the application to the enquiry it came from and marks that enquiry converted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  source_enquiry_id?: number;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id?: number;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  application_date?: string;
}

export class ChangeApplicationStatusDto {
  @ApiProperty({
    enum: AdmissionApplicationStatus,
    description:
      'Target status. `offered` and `admitted` are reached only through the offer / confirmation workflows.',
  })
  @IsEnum(AdmissionApplicationStatus)
  status: AdmissionApplicationStatus;

  @ApiPropertyOptional({
    description: 'Required when rejecting or cancelling an application',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class QueryApplicationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Matches application number, applicant name/phone/email',
  })
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  applicant_id?: number;

  @ApiPropertyOptional({
    example: 'submitted,under_review',
    description: 'One status or a comma-separated list',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: '2027-01-01',
    description: 'application_date >=',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description: 'application_date <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['application_date', 'application_number', 'status', 'created_at'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
