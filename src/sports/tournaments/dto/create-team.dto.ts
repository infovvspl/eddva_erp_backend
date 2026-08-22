import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeamMemberInput {
  @ApiProperty({ example: 1, description: 'Participant ID' })
  @IsInt()
  @IsNotEmpty()
  participant_id: number;

  @ApiPropertyOptional({ example: 'captain', description: 'captain | player | substitute' })
  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateTeamDto {
  @ApiProperty({ example: 'Falcon Senior XI' })
  @IsString()
  @IsNotEmpty()
  team_name: string;

  @ApiPropertyOptional({ example: 1, description: 'House ID for inter-house events' })
  @IsOptional()
  @IsInt()
  house_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Coach Staff ID' })
  @IsOptional()
  @IsInt()
  coach_id?: number;

  @ApiPropertyOptional({ type: [TeamMemberInput], description: 'List of team members' })
  @IsOptional()
  @IsArray()
  members?: TeamMemberInput[];
}
