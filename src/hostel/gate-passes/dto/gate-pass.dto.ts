import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { HostelGatePassStatus, HostelGatePassType } from '@prisma/client';
import { DateRangeQueryDto } from '../../common/page-query.dto';

export class CreateGatePassDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  resident_id: number;

  @ApiProperty({ enum: HostelGatePassType, example: 'day_outing' })
  @IsEnum(HostelGatePassType)
  pass_type: HostelGatePassType;

  @ApiProperty({ example: 'Dental appointment' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ example: 'City Dental Clinic, MG Road' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  destination: string;

  @ApiProperty({ example: '2026-09-21T10:00:00.000Z' })
  @IsDateString()
  requested_out_at: string;

  @ApiProperty({ example: '2026-09-21T16:00:00.000Z' })
  @IsDateString()
  expected_return_at: string;
}

export class ApproveGatePassDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class RejectGatePassDto {
  @ApiProperty({ example: 'Exam week — no outings' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remarks: string;
}

/**
 * Optional cross-check the gate can send with every scan. When the guard
 * scans the resident's ID card together with the pass, a mismatch proves the
 * pass belongs to somebody else and the scan is refused.
 */
export class GateScanDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Resident id read from the ID card',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  resident_id?: number;

  @ApiPropertyOptional({
    example: 'ADM/2026/0142',
    description: 'Admission number read from the ID card',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  admission_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class GateScanByNumberDto extends GateScanDto {
  @ApiProperty({
    example: 'HGP/2026-27/00012',
    description: 'Pass number printed / encoded on the pass',
  })
  @IsString()
  @IsNotEmpty()
  pass_no: string;
}

export class QueryGatePassDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: HostelGatePassStatus })
  @IsOptional()
  @IsEnum(HostelGatePassStatus)
  status?: HostelGatePassStatus;

  @ApiPropertyOptional({ enum: HostelGatePassType })
  @IsOptional()
  @IsEnum(HostelGatePassType)
  pass_type?: HostelGatePassType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resident_id?: number;

  @ApiPropertyOptional({ description: 'Residents currently in this block' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  block_id?: number;
}
