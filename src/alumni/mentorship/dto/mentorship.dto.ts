import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AlumniMatchStatus,
  AlumniMentorStatus,
  AlumniProgramStatus,
} from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import { DATE_ONLY_REGEX } from '../../common/time.util';
import { ToBoolean, ToList, Trim } from '../../common/transforms';

const DATE_MESSAGE = 'must be a date in YYYY-MM-DD format';

export class CreateProgramDto {
  @ApiProperty({ example: '2026 Career Mentorship' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiProperty({ example: '2026-10-01' })
  @Matches(DATE_ONLY_REGEX, { message: `start_date ${DATE_MESSAGE}` })
  start_date: string;

  @ApiProperty({ example: '2027-03-31' })
  @Matches(DATE_ONLY_REGEX, { message: `end_date ${DATE_MESSAGE}` })
  end_date: string;
}

export class UpdateProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: `start_date ${DATE_MESSAGE}` })
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: `end_date ${DATE_MESSAGE}` })
  end_date?: string;

  @ApiPropertyOptional({
    enum: ['active'],
    description:
      'open_for_signup → active. Completing a program is done with POST :id/close',
  })
  @IsOptional()
  @IsIn(['active'])
  status?: 'active';
}

export class QueryProgramDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AlumniProgramStatus })
  @IsOptional()
  @IsEnum(AlumniProgramStatus)
  status?: AlumniProgramStatus;
}

export class CreateMentorDto {
  @ApiPropertyOptional({
    description:
      'Staff only: enrol this alumnus as a mentor. Alumni always create their own mentor profile',
  })
  @IsOptional()
  @IsInt()
  alumni_id?: number;

  @ApiProperty({
    example: ['product management', 'career coaching'],
    description: '1-20 tags, normalised to lower-case',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  expertise_areas: string[];

  @ApiPropertyOptional({ example: 3, default: 3, description: '1-50' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_mentees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 'Weekends, evenings IST' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  availability_note?: string;
}

export class UpdateMentorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  expertise_areas?: string[];

  @ApiPropertyOptional({
    description: 'Cannot drop below the current number of active mentees',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  max_mentees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  availability_note?: string;

  @ApiPropertyOptional({
    enum: ['available', 'inactive'],
    description:
      'Availability switch. "fully_booked" is derived from capacity and cannot be set',
  })
  @IsOptional()
  @IsIn(['available', 'inactive'])
  status?: 'available' | 'inactive';
}

export class QueryMentorDto extends PageQueryDto {
  @ApiPropertyOptional({
    example: 'product management,leadership',
    description: 'Comma-separated; matches any',
  })
  @IsOptional()
  @ToList()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ enum: AlumniMentorStatus })
  @IsOptional()
  @IsEnum(AlumniMentorStatus)
  status?: AlumniMentorStatus;

  @ApiPropertyOptional({
    description: 'Only mentors who can take a mentee now',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  available_only?: boolean;
}

export class CreateMatchDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  mentor_id: number;

  @ApiPropertyOptional({
    description:
      'The mentee is an alumnus (exactly one of this / mentee_student_ref)',
  })
  @ValidateIf((o: CreateMatchDto) => o.mentee_student_ref === undefined)
  @IsInt()
  mentee_alumni_id?: number;

  @ApiPropertyOptional({
    example: 'STU-2026-0142',
    description:
      'The mentee is a current student — the school student reference (no alumni record is created)',
  })
  @ValidateIf((o: CreateMatchDto) => o.mentee_alumni_id === undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  mentee_student_ref?: string;

  @ApiPropertyOptional({
    example: 'Aarav Sharma',
    description: 'Required with mentee_student_ref',
  })
  @ValidateIf((o: CreateMatchDto) => o.mentee_student_ref !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  mentee_name?: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Default today' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: `matched_date ${DATE_MESSAGE}` })
  matched_date?: string;
}

export class UpdateMatchDto {
  @ApiProperty({ enum: ['completed', 'discontinued'], example: 'completed' })
  @IsIn(['completed', 'discontinued'])
  status: 'completed' | 'discontinued';

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class QueryMatchDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  program_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  mentor_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  mentee_alumni_id?: number;

  @ApiPropertyOptional({ enum: AlumniMatchStatus })
  @IsOptional()
  @IsEnum(AlumniMatchStatus)
  status?: AlumniMatchStatus;
}
