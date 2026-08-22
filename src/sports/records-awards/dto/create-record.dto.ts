import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportsRecordType } from '@prisma/client';

export class CreateSportsRecordDto {
  @ApiPropertyOptional({ example: 1, description: 'Participant ID (null for team records)' })
  @IsOptional()
  @IsInt()
  participant_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Tournament Team ID (null for individual records)' })
  @IsOptional()
  @IsInt()
  tournament_team_id?: number;

  @ApiProperty({ example: 1, description: 'Sport ID' })
  @IsInt()
  @IsNotEmpty()
  sport_id: number;

  @ApiProperty({ enum: SportsRecordType, example: SportsRecordType.personal_best })
  @IsEnum(SportsRecordType)
  record_type: SportsRecordType;

  @ApiProperty({ example: '100m Sprint — 11.4s' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: '11.4s' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsString()
  @IsNotEmpty()
  achieved_date: string;

  @ApiPropertyOptional({ example: 1, description: 'Source Fixture ID if generated from match' })
  @IsOptional()
  @IsInt()
  source_fixture_id?: number;
}
