import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { HostelResidentGender, HostelResidentStatus } from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/validation';
import { ToBoolean } from '../../common/transforms';

export class CreateHostelResidentDto {
  @ApiProperty({
    example: 'STU-2026-0142',
    description:
      'Id of the student in the school record system. No Student master exists in this backend, so this is the link back to it; unique per institute.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  student_ref: string;

  @ApiPropertyOptional({ example: 'ADM/2026/0142' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  admission_no?: string;

  @ApiProperty({ example: 'Aarav Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  student_name: string;

  @ApiProperty({ enum: HostelResidentGender, example: 'male' })
  @IsEnum(HostelResidentGender)
  gender: HostelResidentGender;

  @ApiPropertyOptional({ example: 'Grade 9-B' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @ApiProperty({ example: 'Rakesh Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  guardian_name: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @Matches(PHONE_REGEX, { message: `guardian_phone ${PHONE_MESSAGE}` })
  guardian_phone: string;

  @ApiPropertyOptional({ example: 'rakesh@example.com' })
  @IsOptional()
  @IsEmail()
  guardian_email?: string;

  @ApiPropertyOptional({
    example: '2026-06-15',
    description: 'Date of joining the hostel (default today)',
  })
  @IsOptional()
  @IsString()
  admitted_on?: string;
}

/** The student_ref link is fixed once a resident exists. */
export class UpdateHostelResidentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  admission_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  student_name?: string;

  @ApiPropertyOptional({ enum: HostelResidentGender })
  @IsOptional()
  @IsEnum(HostelResidentGender)
  gender?: HostelResidentGender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  guardian_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(PHONE_REGEX, { message: `guardian_phone ${PHONE_MESSAGE}` })
  guardian_phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  guardian_email?: string;
}

export class SuspendResidentDto {
  @ApiProperty({ example: 'Repeated curfew violations' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class ReinstateResidentDto {
  @ApiPropertyOptional({ example: 'Suspension period served' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class ReadmitResidentDto {
  @ApiPropertyOptional({ example: '2027-06-15', description: 'Default today' })
  @IsOptional()
  @IsString()
  admitted_on?: string;
}

export class QueryHostelResidentDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: HostelResidentStatus })
  @IsOptional()
  @IsEnum(HostelResidentStatus)
  status?: HostelResidentStatus;

  @ApiPropertyOptional({ enum: HostelResidentGender })
  @IsOptional()
  @IsEnum(HostelResidentGender)
  gender?: HostelResidentGender;

  @ApiPropertyOptional({ description: 'Residents currently in this block' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;

  @ApiPropertyOptional({ description: 'Residents currently in this room' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  room_id?: number;

  @ApiPropertyOptional({ example: '2026-27' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({
    description: 'true = only residents WITHOUT an active room allotment',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unallotted?: boolean;
}
