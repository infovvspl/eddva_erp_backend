import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  HostelAttendanceSession,
  HostelAttendanceStatus,
} from '@prisma/client';
import { DateRangeQueryDto } from '../../common/page-query.dto';
import { ToBoolean } from '../../common/transforms';

export class MarkAttendanceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'Default today; cannot be in the future',
  })
  @IsOptional()
  @IsString()
  attendance_date?: string;

  @ApiProperty({ enum: HostelAttendanceSession, example: 'night' })
  @IsEnum(HostelAttendanceSession)
  session: HostelAttendanceSession;

  @ApiProperty({ enum: HostelAttendanceStatus, example: 'present' })
  @IsEnum(HostelAttendanceStatus)
  status: HostelAttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  remarks?: string;
}

export class BulkAttendanceEntryDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiProperty({ enum: HostelAttendanceStatus })
  @IsEnum(HostelAttendanceStatus)
  status: HostelAttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  remarks?: string;
}

export class BulkAttendanceDto {
  @ApiPropertyOptional({ example: '2026-09-21', description: 'Default today' })
  @IsOptional()
  @IsString()
  attendance_date?: string;

  @ApiProperty({ enum: HostelAttendanceSession })
  @IsEnum(HostelAttendanceSession)
  session: HostelAttendanceSession;

  @ApiProperty({ type: [BulkAttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceEntryDto)
  entries: BulkAttendanceEntryDto[];
}

export class UpdateAttendanceDto {
  @ApiProperty({ enum: HostelAttendanceStatus })
  @IsEnum(HostelAttendanceStatus)
  status: HostelAttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  remarks?: string;
}

export class QueryAttendanceDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'Single day (same as from=to)',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: HostelAttendanceSession })
  @IsOptional()
  @IsEnum(HostelAttendanceSession)
  session?: HostelAttendanceSession;

  @ApiPropertyOptional({ enum: HostelAttendanceStatus })
  @IsOptional()
  @IsEnum(HostelAttendanceStatus)
  status?: HostelAttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

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

  @ApiPropertyOptional({
    description:
      'Absence report only: keep just absences no gate pass explains',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unaccounted_only?: boolean;
}

export class UnaccountedAbsenceQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-09-21', description: 'Default today' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: HostelAttendanceSession })
  @IsOptional()
  @IsEnum(HostelAttendanceSession)
  session?: HostelAttendanceSession;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;
}
