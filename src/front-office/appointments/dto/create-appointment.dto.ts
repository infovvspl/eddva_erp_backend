import { IsDateString, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateAppointmentDto {
  @ApiPropertyOptional({ description: 'Existing visitor_id — omit if the visitor has not been registered yet' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visitor_id?: number;

  @ApiProperty({ example: 'Kavita Rao' })
  @IsString()
  @IsNotEmpty()
  visitor_name: string;

  @ApiPropertyOptional({ example: '9876511111' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 1, description: 'employee_id of the host' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  host_employee_id: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  department_id: number;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  appointment_date: string;

  @ApiProperty({ example: '10:00' })
  @Matches(TIME_PATTERN, { message: 'start_time must be in HH:mm 24h format' })
  start_time: string;

  @ApiProperty({ example: '10:30' })
  @Matches(TIME_PATTERN, { message: 'end_time must be in HH:mm 24h format' })
  end_time: string;

  @ApiPropertyOptional({ example: 'Discuss admission process' })
  @IsOptional()
  @IsString()
  purpose?: string;
}
