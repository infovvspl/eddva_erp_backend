import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportsPointSourceType } from '@prisma/client';

export class AwardHousePointsDto {
  @ApiProperty({ example: 50, description: 'Points awarded (can be negative for deductions)' })
  @IsInt()
  @IsNotEmpty()
  points: number;

  @ApiProperty({ enum: SportsPointSourceType, example: SportsPointSourceType.tournament_result })
  @IsEnum(SportsPointSourceType)
  source_type: SportsPointSourceType;

  @ApiPropertyOptional({ example: 1, description: 'Source ID (tournament_id or fixture_id)' })
  @IsOptional()
  @IsInt()
  source_reference_id?: number;

  @ApiPropertyOptional({ example: '1st Place in Inter-House Football 2026' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsString()
  @IsNotEmpty()
  awarded_date: string;

  @ApiProperty({ example: '2026-27', description: 'Academic year to update standings ledger' })
  @IsString()
  @IsNotEmpty()
  academic_year: string;
}
