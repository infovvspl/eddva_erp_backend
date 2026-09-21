import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  AlumniApplicationStatus,
  AlumniJobStatus,
  AlumniJobType,
} from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import { ToBoolean, Trim } from '../../common/transforms';
import { HTTP_URL_OPTIONS } from '../../common/validation';

export class CreateJobDto {
  @ApiProperty({ example: 'Backend Engineer' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Acme Corp' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company: string;

  @ApiProperty({ example: 'We are hiring…' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description: string;

  @ApiPropertyOptional({ example: 'Bangalore' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiProperty({ enum: AlumniJobType, example: 'full_time' })
  @IsEnum(AlumniJobType)
  job_type: AlumniJobType;

  @ApiPropertyOptional({ example: 'Technology' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    description:
      'Must be in the future. After it the posting expires and takes no applications',
  })
  @IsOptional()
  @IsDateString()
  expiry_date?: string;

  @ApiPropertyOptional({
    description:
      'Staff only: post on behalf of this alumnus. Omit to post for a partner company (no alumnus poster)',
  })
  @IsOptional()
  @IsInt()
  posted_by_alumni_id?: number;
}

export class UpdateJobDto {
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
  @IsNotEmpty()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ enum: AlumniJobType })
  @IsOptional()
  @IsEnum(AlumniJobType)
  job_type?: AlumniJobType;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({
    description: 'A future date re-opens an expired posting',
  })
  @IsOptional()
  @IsDateString()
  expiry_date?: string;
}

export class QueryJobDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: AlumniJobType })
  @IsOptional()
  @IsEnum(AlumniJobType)
  job_type?: AlumniJobType;

  @ApiPropertyOptional({
    enum: AlumniJobStatus,
    description:
      'open = not closed and not past its expiry date; expired includes postings past expiry the sweep has not yet flipped',
  })
  @IsOptional()
  @IsEnum(AlumniJobStatus)
  status?: AlumniJobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  posted_by_alumni_id?: number;

  @ApiPropertyOptional({ description: 'Only postings I posted (alumni)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  mine?: boolean;
}

export class ApplyJobDto {
  @ApiPropertyOptional({
    description: 'Link to a resume hosted elsewhere (http/https)',
  })
  @IsOptional()
  @Trim()
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(500)
  resume_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(3000)
  cover_note?: string;

  @ApiPropertyOptional({
    description: 'Staff only: apply on behalf of this alumnus',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;
}

export class UpdateApplicationStatusDto {
  @ApiProperty({
    enum: ['shortlisted', 'rejected', 'hired'],
    example: 'shortlisted',
  })
  @IsIn(['shortlisted', 'rejected', 'hired'])
  status: 'shortlisted' | 'rejected' | 'hired';

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class QueryApplicationDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniApplicationStatus })
  @IsOptional()
  @IsEnum(AlumniApplicationStatus)
  status?: AlumniApplicationStatus;

  @ApiPropertyOptional({ description: 'Staff only' })
  @IsOptional()
  @IsInt()
  job_id?: number;

  @ApiPropertyOptional({
    description: 'Staff only; alumni always see just their own',
  })
  @IsOptional()
  @IsInt()
  applicant_alumni_id?: number;
}
