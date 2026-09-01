import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateRouteStopDto {
  @ApiProperty({ example: 'Central Station' })
  @IsString()
  @IsNotEmpty()
  stop_name: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence_no: number;

  @ApiPropertyOptional({ example: 28.7041 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 77.1025 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'pickup_time must be in HH:mm 24h format' })
  pickup_time?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'drop_time must be in HH:mm 24h format' })
  drop_time?: string;
}
