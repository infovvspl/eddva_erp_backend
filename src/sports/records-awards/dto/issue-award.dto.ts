import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueAwardDto {
  @ApiPropertyOptional({ example: 1, description: 'Participant ID' })
  @IsOptional()
  @IsInt()
  participant_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Tournament Team ID' })
  @IsOptional()
  @IsInt()
  tournament_team_id?: number;

  @ApiProperty({ example: 'Gold Medal', description: 'Gold Medal, MVP, Best Bowler, Certificate' })
  @IsString()
  @IsNotEmpty()
  award_type: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsString()
  @IsNotEmpty()
  issued_date: string;
}
