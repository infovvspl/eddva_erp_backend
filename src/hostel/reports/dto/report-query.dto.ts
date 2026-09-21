import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from '../../common/page-query.dto';

export const REPORT_NAMES = [
  'occupancy',
  'room-occupancy',
  'residents',
  'allotment-history',
  'gate-movement',
  'overdue-residents',
  'attendance',
  'unaccounted-absences',
  'visitors',
  'mess-consumption',
  'complaints',
  'fee-outstanding',
  'fee-payments',
  'discipline',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

/** Extra permission (beyond reports:read) a report needs because of the data it exposes. */
export const REPORT_DATA_PERMISSION: Partial<
  Record<ReportName, { resource: string; action: string }>
> = {
  visitors: { resource: 'visitors', action: 'read' },
  'fee-outstanding': { resource: 'invoices', action: 'read' },
  'fee-payments': { resource: 'payments', action: 'read' },
  discipline: { resource: 'discipline', action: 'read' },
};

/** One filter set shared by all reports; each report uses the ones that make sense for it and ignores the rest. */
export class HostelReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  room_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional({
    description: 'Status filter; valid values depend on the report',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'double' })
  @IsOptional()
  @IsString()
  room_type?: string;

  @ApiPropertyOptional({ example: '2026-27' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({
    example: 'night',
    description: 'attendance / unaccounted-absences',
  })
  @IsOptional()
  @IsString()
  session?: string;

  @ApiPropertyOptional({ example: 'dinner', description: 'mess-consumption' })
  @IsOptional()
  @IsString()
  meal_type?: string;

  @ApiPropertyOptional({ description: 'complaints / discipline category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'upi', description: 'fee-payments' })
  @IsOptional()
  @IsString()
  payment_mode?: string;

  @ApiPropertyOptional({ example: 'male', description: 'residents' })
  @IsOptional()
  @IsString()
  gender?: string;
}
