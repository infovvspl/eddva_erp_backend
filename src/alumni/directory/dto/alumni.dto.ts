import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AlumniVerificationStatus, AlumniVisibility } from '@prisma/client';
import { PageQueryDto } from '../../common/page-query.dto';
import {
  HTTP_URL_OPTIONS,
  PHONE_MESSAGE,
  PHONE_REGEX,
} from '../../common/validation';
import { ToBoolean, Trim, TrimLower } from '../../common/transforms';

/** Profile fields shared by staff-created and self-registered alumni. */
export class AlumniProfileFieldsDto {
  @ApiProperty({ example: 'Aarav Sharma' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @ApiProperty({
    example: 'aarav@example.com',
    description: 'Unique per institute; stored lower-case',
  })
  @TrimLower()
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty({ example: 2015, description: 'Batch (cohort) year' })
  @IsInt()
  @Min(1900)
  @Max(2100)
  batch_year: number;

  @ApiPropertyOptional({ example: 2015 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  graduation_year?: number;

  @ApiPropertyOptional({ example: 'MBA' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  program?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_REGEX, { message: `phone ${PHONE_MESSAGE}` })
  phone?: string;

  @ApiPropertyOptional({
    example: 'STU-2015-0142',
    description:
      'Reference to the historical student record (no Student master exists in this backend). Unique per institute.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  student_ref?: string;

  @ApiPropertyOptional({ example: 'ADM/2011/0142' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  admission_no?: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  current_company?: string;

  @ApiPropertyOptional({ example: 'Product Manager' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  current_designation?: string;

  @ApiPropertyOptional({ example: 'Technology' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional({ example: 'Bangalore' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'https://www.linkedin.com/in/aarav' })
  @IsOptional()
  @Trim()
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(300)
  linkedin_url?: string;

  @ApiPropertyOptional({ enum: AlumniVisibility, default: 'alumni_only' })
  @IsOptional()
  @IsEnum(AlumniVisibility)
  visibility?: AlumniVisibility;

  @ApiPropertyOptional({
    description:
      'When true, other verified alumni can see this profile email/phone. Default false.',
  })
  @IsOptional()
  @IsBoolean()
  contact_visible?: boolean;

  @ApiPropertyOptional({
    description: 'Newsletter e-mail opt-in (default true)',
  })
  @IsOptional()
  @IsBoolean()
  email_opt_in?: boolean;

  @ApiPropertyOptional({ description: 'Newsletter SMS opt-in (default true)' })
  @IsOptional()
  @IsBoolean()
  sms_opt_in?: boolean;
}

/** Staff-created alumni. */
export class CreateAlumniDto extends AlumniProfileFieldsDto {
  @ApiPropertyOptional({
    enum: ['pending', 'verified'],
    default: 'verified',
    description:
      'Staff-created profiles are verified by default (staff vouch for them); pass "pending" to route through the verification queue.',
  })
  @IsOptional()
  @IsIn(['pending', 'verified'])
  verification_status?: 'pending' | 'verified';
}

/** Staff update — every field optional. */
export class UpdateAlumniDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name?: string;

  @ApiPropertyOptional({
    description:
      'Changing the e-mail also changes the portal login name of a linked account',
  })
  @IsOptional()
  @TrimLower()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  student_ref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  admission_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  batch_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  graduation_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  program?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_REGEX, { message: `phone ${PHONE_MESSAGE}` })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  current_company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  current_designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(300)
  linkedin_url?: string;

  @ApiPropertyOptional({ enum: AlumniVisibility })
  @IsOptional()
  @IsEnum(AlumniVisibility)
  visibility?: AlumniVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  contact_visible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email_opt_in?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sms_opt_in?: boolean;
}

/**
 * What an alumnus may change on their own profile. Identity (email,
 * student_ref, admission_no), batch/graduation year, program and verification
 * are staff-controlled: changing them would let someone alter the facts that
 * verification vouched for.
 */
export class UpdateOwnProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_REGEX, { message: `phone ${PHONE_MESSAGE}` })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  current_company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  current_designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsUrl(HTTP_URL_OPTIONS)
  @MaxLength(300)
  linkedin_url?: string;

  @ApiPropertyOptional({ enum: AlumniVisibility })
  @IsOptional()
  @IsEnum(AlumniVisibility)
  visibility?: AlumniVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  contact_visible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email_opt_in?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sms_opt_in?: boolean;
}

export class RejectAlumniDto {
  @ApiPropertyOptional({
    example: 'Could not match this batch in school records',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SubmitVerificationDto {
  @ApiPropertyOptional({
    example: 'Class of 2015, section B, house Blue. Teacher: Mrs. Rao',
    description: 'Evidence that helps staff confirm the alumnus identity',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class IssueAccountDto {
  @ApiProperty({
    example: 'Temp#Pass2026',
    description: 'Initial (or reset) password, min 8 characters',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;
}

const ALUMNI_SORT = [
  'full_name',
  'batch_year',
  'graduation_year',
  'program',
  'current_company',
  'city',
  'verification_status',
  'registered_at',
  'created_at',
] as const;
export const ALUMNI_SORT_FIELDS = ALUMNI_SORT;

/** Directory list/search filters (staff and alumni share it; visibility rules are applied server-side). */
export class QueryAlumniDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 2015 })
  @IsOptional()
  @IsInt()
  batch_year?: number;

  @ApiPropertyOptional({ example: 2015 })
  @IsOptional()
  @IsInt()
  graduation_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designation?: string;

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

  @ApiPropertyOptional({ description: 'Members of this alumni group' })
  @IsOptional()
  @IsInt()
  group_id?: number;

  @ApiPropertyOptional({
    enum: AlumniVerificationStatus,
    description: 'Staff only — alumni always see verified profiles only',
  })
  @IsOptional()
  @IsEnum(AlumniVerificationStatus)
  verification_status?: AlumniVerificationStatus;

  @ApiPropertyOptional({ enum: AlumniVisibility, description: 'Staff only' })
  @IsOptional()
  @IsEnum(AlumniVisibility)
  visibility?: AlumniVisibility;

  @ApiPropertyOptional({
    enum: ['staff_created', 'self_registered'],
    description: 'Staff only',
  })
  @IsOptional()
  @IsIn(['staff_created', 'self_registered'])
  source?: 'staff_created' | 'self_registered';

  @ApiPropertyOptional({
    description: 'Staff only — include deactivated profiles',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  include_inactive?: boolean;
}

/** Unauthenticated directory: only public + verified profiles, no contact details. */
export class QueryPublicDirectoryDto {
  @ApiProperty({ description: 'Institute whose public directory to list' })
  @IsString()
  @IsNotEmpty()
  institute_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Max 50' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Name search' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  batch_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;
}
