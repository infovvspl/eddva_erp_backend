import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterGpsDeviceDto {
  @ApiProperty({ example: 'GPS-SN-00123' })
  @IsString()
  @IsNotEmpty()
  device_serial: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  sim_number?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  installed_date?: string;
}
