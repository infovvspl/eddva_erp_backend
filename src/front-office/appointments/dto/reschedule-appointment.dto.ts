import { IsDateString, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-09-02' })
  @IsDateString()
  appointment_date: string;

  @ApiProperty({ example: '11:00' })
  @Matches(TIME_PATTERN, { message: 'start_time must be in HH:mm 24h format' })
  start_time: string;

  @ApiProperty({ example: '11:30' })
  @Matches(TIME_PATTERN, { message: 'end_time must be in HH:mm 24h format' })
  end_time: string;

  @ApiPropertyOptional({ description: 'Reassign to a different host as part of the reschedule' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  host_employee_id?: number;
}
