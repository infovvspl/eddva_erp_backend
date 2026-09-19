import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AdmissionGender } from '@prisma/client';
import { PHONE_MESSAGE, PHONE_REGEX } from '../../common/validation';

/** The person. Reused inline by application creation / enquiry conversion. */
export class CreateApplicantDto {
  @ApiProperty({ example: 'Aarav Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: '2016-05-14' })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional({ enum: AdmissionGender })
  @IsOptional()
  @IsEnum(AdmissionGender)
  gender?: AdmissionGender;

  @ApiPropertyOptional({ example: 'parent@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @Matches(PHONE_REGEX, { message: `phone ${PHONE_MESSAGE}` })
  phone: string;

  @ApiPropertyOptional({ example: '12 Park Street, Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Rohit Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guardian_name?: string;

  @ApiPropertyOptional({ example: '+91 98765 43211' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: `guardian_contact ${PHONE_MESSAGE}` })
  guardian_contact?: string;

  @ApiPropertyOptional({ description: 'Stored photo reference/URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_url?: string;
}

export class UpdateApplicantDto extends PartialType(CreateApplicantDto) {}

export class QueryApplicantDto {
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

  @ApiPropertyOptional({ enum: ['name', 'created_at'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
