import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdmissionConfirmationStatus,
  AdmissionStudentLinkStatus,
} from '@prisma/client';

export class CancelConfirmationDto {
  @ApiProperty({ example: 'Family withdrew before joining' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class LinkStudentDto {
  @ApiProperty({
    example: 'STU-2027-0042',
    description:
      'Identifier of the Student record created downstream for this confirmed admission',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  student_ref: string;
}

export class QueryConfirmationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: AdmissionConfirmationStatus })
  @IsOptional()
  @IsEnum(AdmissionConfirmationStatus)
  status?: AdmissionConfirmationStatus;

  @ApiPropertyOptional({
    enum: AdmissionStudentLinkStatus,
    description:
      'pending = confirmed admissions still waiting for their Student record',
  })
  @IsOptional()
  @IsEnum(AdmissionStudentLinkStatus)
  student_link_status?: AdmissionStudentLinkStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id?: number;

  @ApiPropertyOptional({
    description:
      'Matches enrollment number, application number, applicant name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2027-04-01',
    description: 'confirmed_date >=',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-04-30',
    description: 'confirmed_date <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;
}
