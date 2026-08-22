import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordResultDto {
  @ApiProperty({ example: '3', description: 'Score for Team A (as text to support any sport format)' })
  @IsString()
  @IsNotEmpty()
  team_a_score: string;

  @ApiProperty({ example: '1', description: 'Score for Team B' })
  @IsString()
  @IsNotEmpty()
  team_b_score: string;

  @ApiPropertyOptional({ example: 1, description: 'Winning Team ID (null for draw)' })
  @IsOptional()
  @IsInt()
  winner_team_id?: number;

  @ApiPropertyOptional({ example: 'Great match, 2 goals scored in second half' })
  @IsOptional()
  @IsString()
  result_notes?: string;

  @ApiPropertyOptional({ example: 50, description: 'Optional house points to award winner house automatically' })
  @IsOptional()
  @IsInt()
  house_points_award?: number;

  @ApiPropertyOptional({ example: '2026-27', description: 'Academic year for house points award' })
  @IsOptional()
  @IsString()
  academic_year?: string;
}
