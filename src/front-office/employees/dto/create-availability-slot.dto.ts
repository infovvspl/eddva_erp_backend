import { IsBoolean, IsDateString, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateAvailabilitySlotDto {
  @ApiProperty({ example: '2026-09-01', description: 'Date (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'start_time must be in HH:mm 24h format' })
  start_time: string;

  @ApiProperty({ example: '17:00' })
  @Matches(TIME_PATTERN, { message: 'end_time must be in HH:mm 24h format' })
  end_time: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_available?: boolean = true;
}
