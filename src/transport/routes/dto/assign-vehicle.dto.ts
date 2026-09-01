import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AssignVehicleToRouteDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  effective_from: string;

  @ApiPropertyOptional({ example: 1, description: 'driver_id to assign alongside the vehicle' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  driver_id?: number;
}
