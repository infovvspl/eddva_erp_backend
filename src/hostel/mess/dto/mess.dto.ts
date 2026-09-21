import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  HostelDayOfWeek,
  HostelMealAttendanceStatus,
  HostelMealType,
} from '@prisma/client';
import { DateRangeQueryDto, PageQueryDto } from '../../common/page-query.dto';
import { ToBoolean } from '../../common/transforms';

export class CreateMessMenuDto {
  @ApiProperty({ enum: HostelDayOfWeek, example: 'monday' })
  @IsEnum(HostelDayOfWeek)
  day_of_week: HostelDayOfWeek;

  @ApiProperty({ enum: HostelMealType, example: 'breakfast' })
  @IsEnum(HostelMealType)
  meal_type: HostelMealType;

  @ApiProperty({ type: [String], example: ['Poha', 'Boiled egg', 'Tea'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  items: string[];

  @ApiProperty({
    example: '2026-09-01',
    description:
      'Menu applies from this date until a later menu for the same day/meal takes over',
  })
  @IsString()
  effective_from: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** day_of_week / meal_type identify the slot and cannot change; create a new menu for another slot. */
export class UpdateMessMenuDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  items?: string[];

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsString()
  effective_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class QueryMessMenuDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: HostelDayOfWeek })
  @IsOptional()
  @IsEnum(HostelDayOfWeek)
  day_of_week?: HostelDayOfWeek;

  @ApiPropertyOptional({ enum: HostelMealType })
  @IsOptional()
  @IsEnum(HostelMealType)
  meal_type?: HostelMealType;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  is_active?: boolean;
}

export class MessMenuDateQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'Menu in force on this date (default today)',
  })
  @IsOptional()
  @IsString()
  date?: string;
}

// ─── Meal attendance ────────────────────────────────────────────────────────

export class MarkMealAttendanceDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiPropertyOptional({
    example: '2026-09-21',
    description:
      'Default today. Future dates accept opted_in/opted_out only; consumed/missed need today or earlier',
  })
  @IsOptional()
  @IsString()
  meal_date?: string;

  @ApiProperty({ enum: HostelMealType })
  @IsEnum(HostelMealType)
  meal_type: HostelMealType;

  @ApiProperty({ enum: HostelMealAttendanceStatus, example: 'opted_in' })
  @IsEnum(HostelMealAttendanceStatus)
  status: HostelMealAttendanceStatus;
}

export class BulkMealEntryDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiProperty({ enum: HostelMealAttendanceStatus })
  @IsEnum(HostelMealAttendanceStatus)
  status: HostelMealAttendanceStatus;
}

export class BulkMealAttendanceDto {
  @ApiPropertyOptional({ example: '2026-09-21', description: 'Default today' })
  @IsOptional()
  @IsString()
  meal_date?: string;

  @ApiProperty({ enum: HostelMealType })
  @IsEnum(HostelMealType)
  meal_type: HostelMealType;

  @ApiProperty({ type: [BulkMealEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkMealEntryDto)
  entries: BulkMealEntryDto[];
}

export class UpdateMealAttendanceDto {
  @ApiProperty({ enum: HostelMealAttendanceStatus })
  @IsEnum(HostelMealAttendanceStatus)
  status: HostelMealAttendanceStatus;
}

export class QueryMealAttendanceDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'Single day (same as from=to)',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: HostelMealType })
  @IsOptional()
  @IsEnum(HostelMealType)
  meal_type?: HostelMealType;

  @ApiPropertyOptional({ enum: HostelMealAttendanceStatus })
  @IsOptional()
  @IsEnum(HostelMealAttendanceStatus)
  status?: HostelMealAttendanceStatus;

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
}
