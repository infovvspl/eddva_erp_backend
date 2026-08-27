import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFollowupDto {
  @ApiProperty({ example: 'Called the enquirer, awaiting document submission' })
  @IsString()
  @IsNotEmpty()
  notes: string;

  @ApiPropertyOptional({ example: '2026-09-10', description: 'Defaults to now if omitted' })
  @IsOptional()
  @IsDateString()
  followup_date?: string;

  @ApiPropertyOptional({ example: '2026-09-17' })
  @IsOptional()
  @IsDateString()
  next_followup_date?: string;
}
