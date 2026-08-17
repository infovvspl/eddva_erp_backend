import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateMenuScheduleDto {
  @ApiProperty({ example: 'MONDAY', description: 'Day of week e.g. MONDAY, TUESDAY or 1..7' })
  @IsNotEmpty()
  @IsString()
  dayOfWeek: string;

  @ApiProperty({ example: '08:00', description: 'Start time in HH:mm format' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be HH:mm' })
  startTime: string;

  @ApiProperty({ example: '11:30', description: 'End time in HH:mm format' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'endTime must be HH:mm' })
  endTime: string;
}
