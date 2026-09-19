import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { AdmissionEnquirySource, AdmissionEnquiryStatus } from '@prisma/client';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/validation';
import { CreateApplicantDto } from '../../applicants/dto/applicant.dto';

export class CreateAdmissionEnquiryDto {
  @ApiProperty({ example: 'Sunita Verma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @Matches(PHONE_REGEX, { message: `phone ${PHONE_MESSAGE}` })
  phone: string;

  @ApiPropertyOptional({ example: 'sunita@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Program the enquirer is interested in' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id?: number;

  @ApiProperty({ enum: AdmissionEnquirySource, example: 'walk_in' })
  @IsEnum(AdmissionEnquirySource)
  source: AdmissionEnquirySource;

  @ApiPropertyOptional({
    description: 'eddva_user_id of the admission officer to assign',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  assigned_to?: string;
}

/** Status and assignment have their own endpoints so each is audited and permissioned on its own. */
export class UpdateAdmissionEnquiryDto extends PartialType(
  OmitType(CreateAdmissionEnquiryDto, ['assigned_to'] as const),
) {}

export class AssignEnquiryDto {
  @ApiProperty({
    description: 'eddva_user_id of an active admission staff member',
  })
  @IsString()
  @IsNotEmpty()
  assigned_to: string;
}

export class ChangeEnquiryStatusDto {
  @ApiProperty({
    enum: AdmissionEnquiryStatus,
    description:
      '`converted` is set only by converting the enquiry into an application',
  })
  @IsEnum(AdmissionEnquiryStatus)
  status: AdmissionEnquiryStatus;
}

export class CreateFollowupDto {
  @ApiProperty({ example: 'Called the parent; visiting campus on Friday' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  notes: string;

  @ApiProperty({ example: '2027-01-10' })
  @IsDateString()
  followup_date: string;

  @ApiPropertyOptional({ example: '2027-01-14' })
  @IsOptional()
  @IsDateString()
  next_followup_date?: string;
}

export class UpdateFollowupDto extends PartialType(CreateFollowupDto) {}

/** Extra applicant details collected at conversion; name/phone/email come from the enquiry. */
export class ConvertApplicantDetailsDto extends OmitType(CreateApplicantDto, [
  'name',
  'phone',
  'email',
] as const) {}

export class ConvertEnquiryDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id: number;

  @ApiPropertyOptional({ description: 'Defaults to the enquiry’s program' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id?: number;

  @ApiPropertyOptional({
    description:
      'Attach to an existing applicant instead of creating/reusing one from the enquiry',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicant_id?: number;

  @ApiPropertyOptional({ type: ConvertApplicantDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConvertApplicantDetailsDto)
  applicant_details?: ConvertApplicantDetailsDto;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  application_date?: string;
}

export class QueryAdmissionEnquiryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Matches name, phone or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AdmissionEnquiryStatus })
  @IsOptional()
  @IsEnum(AdmissionEnquiryStatus)
  status?: AdmissionEnquiryStatus;

  @ApiPropertyOptional({ enum: AdmissionEnquirySource })
  @IsOptional()
  @IsEnum(AdmissionEnquirySource)
  source?: AdmissionEnquirySource;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  program_id?: number;

  @ApiPropertyOptional({ description: 'eddva_user_id of the assignee' })
  @IsOptional()
  @IsString()
  assigned_to?: string;

  @ApiPropertyOptional({
    description:
      'Only open enquiries whose next follow-up is due today or earlier',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  followup_due?: boolean;

  @ApiPropertyOptional({ example: '2027-01-01', description: 'created_at >=' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description: 'created_at <= (inclusive)',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['created_at', 'name', 'status'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
