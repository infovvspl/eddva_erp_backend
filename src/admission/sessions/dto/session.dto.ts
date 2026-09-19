import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AdmissionSessionStatus } from '@prisma/client';

export class CreateAdmissionSessionDto {
  @ApiProperty({ example: '2027-28' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '2027-04-01' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2028-03-31' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({ enum: AdmissionSessionStatus, default: 'upcoming' })
  @IsOptional()
  @IsEnum(AdmissionSessionStatus)
  status?: AdmissionSessionStatus;
}

export class UpdateAdmissionSessionDto extends PartialType(
  CreateAdmissionSessionDto,
) {}

export class QueryAdmissionSessionDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Matches session name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AdmissionSessionStatus })
  @IsOptional()
  @IsEnum(AdmissionSessionStatus)
  status?: AdmissionSessionStatus;

  @ApiPropertyOptional({ enum: ['name', 'start_date', 'created_at'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
