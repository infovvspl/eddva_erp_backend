import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateMenuScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dayOfWeek?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'endTime must be HH:mm' })
  endTime?: string;
}
