import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from '../../common/page-query.dto';

export const REPORT_NAMES = [
  'alumni-directory',
  'alumni-by-batch',
  'alumni-by-program',
  'alumni-employment',
  'alumni-location',
  'event-registrations',
  'event-attendance',
  'event-revenue',
  'job-postings',
  'job-applications',
  'hiring',
  'mentors',
  'mentees',
  'mentorship-matches',
  'campaigns',
  'donations',
  'donor-history',
  'donation-totals',
  'payment-modes',
  'newsletters',
  'delivery-statistics',
  'engagement',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

/**
 * Reports that expose another module's data also need that module's read
 * permission (a finance-only role should not read the directory through a
 * report, and vice versa). Everything needs `reports:read`; exporting needs
 * `reports:export` on top.
 */
export const REPORT_DATA_PERMISSION: Partial<
  Record<ReportName, { resource: string; action: string }>
> = {
  'alumni-directory': { resource: 'alumni', action: 'read' },
  'alumni-employment': { resource: 'employment', action: 'read' },
  'event-registrations': { resource: 'event_registrations', action: 'read' },
  'event-attendance': { resource: 'event_registrations', action: 'read' },
  'event-revenue': { resource: 'event_payments', action: 'read' },
  'job-applications': { resource: 'job_applications', action: 'read' },
  hiring: { resource: 'job_applications', action: 'read' },
  campaigns: { resource: 'campaigns', action: 'read' },
  donations: { resource: 'donations', action: 'read' },
  'donor-history': { resource: 'donations', action: 'read' },
  'donation-totals': { resource: 'donations', action: 'read' },
  'payment-modes': { resource: 'donations', action: 'read' },
  newsletters: { resource: 'communication', action: 'read' },
  'delivery-statistics': { resource: 'communication', action: 'read' },
  engagement: { resource: 'communication', action: 'read' },
};

export class AlumniReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  batch_year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  event_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  job_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  campaign_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  newsletter_id?: number;

  @ApiPropertyOptional({
    description: 'Status filter; the allowed values depend on the report',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Donation payment mode (donation reports)',
  })
  @IsOptional()
  @IsString()
  payment_mode?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}
