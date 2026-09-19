import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const REPORT_SOURCES = [
  'walk_in',
  'website',
  'referral',
  'agent',
  'advertisement',
  'direct',
] as const;

export const REPORT_NAMES = [
  'funnel',
  'seats',
  'offers',
  'documents',
  'admissions',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export class AdmissionReportQueryDto {
  @ApiPropertyOptional({ description: 'Academic session' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  session_id?: number;

  @ApiPropertyOptional({ description: 'Program' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  program_id?: number;

  @ApiPropertyOptional({
    enum: REPORT_SOURCES,
    description:
      'Enquiry source. `direct` = applications that did not originate from an enquiry',
  })
  @IsOptional()
  @IsIn(REPORT_SOURCES)
  source?: (typeof REPORT_SOURCES)[number];

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2027-03-31', description: 'Inclusive' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 1, description: 'admissions report only' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20, description: 'admissions report only' })
  @IsOptional()
  limit?: number;
}
