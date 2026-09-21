import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { HostelAllotmentStatus, HostelTransferStatus } from '@prisma/client';
import { DateRangeQueryDto } from '../../common/page-query.dto';
import {
  ACADEMIC_YEAR_MESSAGE,
  ACADEMIC_YEAR_REGEX,
} from '../../common/validation';

export class CreateAllotmentDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  room_id: number;

  @ApiPropertyOptional({
    example: 31,
    description:
      'Required when the room has bed-level tracking; must be omitted for room-level rooms',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  bed_id?: number;

  @ApiProperty({ example: '2026-27' })
  @IsString()
  @Matches(ACADEMIC_YEAR_REGEX, { message: ACADEMIC_YEAR_MESSAGE })
  academic_year: string;

  @ApiPropertyOptional({ example: '2026-06-15', description: 'Default today' })
  @IsOptional()
  @IsString()
  allotment_date?: string;
}

export class VacateResidentDto {
  @ApiPropertyOptional({ example: '2027-03-31', description: 'Default today' })
  @IsOptional()
  @IsString()
  vacate_date?: string;

  @ApiPropertyOptional({ example: 'Left the school' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TransferResidentDto {
  @ApiProperty({ example: 14, description: 'Destination room' })
  @IsInt()
  @Min(1)
  room_id: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  bed_id?: number;

  @ApiPropertyOptional({
    example: '2026-27',
    description: 'Defaults to the academic year of the stay being closed',
  })
  @IsOptional()
  @IsString()
  @Matches(ACADEMIC_YEAR_REGEX, { message: ACADEMIC_YEAR_MESSAGE })
  academic_year?: string;

  @ApiPropertyOptional({ example: '2026-09-21', description: 'Default today' })
  @IsOptional()
  @IsString()
  transfer_date?: string;

  @ApiProperty({ example: 'Moved closer to the study hall' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class QueryAllotmentDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  room_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;

  @ApiPropertyOptional({ example: '2026-27' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({ enum: HostelAllotmentStatus })
  @IsOptional()
  @IsEnum(HostelAllotmentStatus)
  status?: HostelAllotmentStatus;
}

// ─── Transfer requests ──────────────────────────────────────────────────────

export class CreateTransferRequestDto {
  @ApiProperty({
    example: 14,
    description: 'Room the resident wants to move to',
  })
  @IsInt()
  @Min(1)
  requested_room_id: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  requested_bed_id?: number;

  @ApiProperty({ example: 'Roommate conflict' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class ApproveTransferRequestDto {
  @ApiPropertyOptional({
    example: 40,
    description: 'Override the bed asked for in the request',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  bed_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class RejectTransferRequestDto {
  @ApiProperty({ example: 'Requested room is reserved for senior students' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remarks: string;
}

export class QueryTransferRequestDto extends DateRangeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional({ enum: HostelTransferStatus })
  @IsOptional()
  @IsEnum(HostelTransferStatus)
  status?: HostelTransferStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  current_room_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requested_room_id?: number;
}
