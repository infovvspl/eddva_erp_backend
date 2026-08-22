import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportsFixtureStatus } from '@prisma/client';

export class CreateFixtureDto {
  @ApiProperty({ example: 'Finals' })
  @IsString()
  @IsNotEmpty()
  round: string;

  @ApiProperty({ example: 1, description: 'Tournament Team A ID' })
  @IsInt()
  @IsNotEmpty()
  team_a_id: number;

  @ApiProperty({ example: 2, description: 'Tournament Team B ID' })
  @IsInt()
  @IsNotEmpty()
  team_b_id: number;

  @ApiPropertyOptional({ example: 1, description: 'Venue ID' })
  @IsOptional()
  @IsInt()
  venue_id?: number;

  @ApiProperty({ example: '2026-09-10T15:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  scheduled_date: string;

  @ApiPropertyOptional({ enum: SportsFixtureStatus, example: SportsFixtureStatus.scheduled })
  @IsOptional()
  @IsEnum(SportsFixtureStatus)
  status?: SportsFixtureStatus;
}
