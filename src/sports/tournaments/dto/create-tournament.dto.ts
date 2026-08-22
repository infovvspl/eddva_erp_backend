import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SportsTournamentFormat, SportsTournamentLevel, SportsTournamentStatus } from '@prisma/client';

export class CreateTournamentDto {
  @ApiProperty({ example: 'Inter-House Football Championship 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1, description: 'Sport ID' })
  @IsInt()
  @IsNotEmpty()
  sport_id: number;

  @ApiPropertyOptional({ enum: SportsTournamentLevel, example: SportsTournamentLevel.inter_house })
  @IsOptional()
  @IsEnum(SportsTournamentLevel)
  level?: SportsTournamentLevel;

  @ApiPropertyOptional({ enum: SportsTournamentFormat, example: SportsTournamentFormat.knockout })
  @IsOptional()
  @IsEnum(SportsTournamentFormat)
  format?: SportsTournamentFormat;

  @ApiProperty({ example: '2026-09-01' })
  @IsString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty({ example: '2026-09-15' })
  @IsString()
  @IsNotEmpty()
  end_date: string;

  @ApiPropertyOptional({ example: 1, description: 'Primary Venue ID' })
  @IsOptional()
  @IsInt()
  venue_id?: number;

  @ApiPropertyOptional({ enum: SportsTournamentStatus, example: SportsTournamentStatus.upcoming })
  @IsOptional()
  @IsEnum(SportsTournamentStatus)
  status?: SportsTournamentStatus;
}

export class UpdateTournamentDto extends PartialType(CreateTournamentDto) {}
