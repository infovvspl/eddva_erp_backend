import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum MaintenanceStatusDto {
  reported = 'reported',
  in_progress = 'in_progress',
  resolved = 'resolved',
}

export class UpdateMaintenanceDto {
  @ApiPropertyOptional({ enum: MaintenanceStatusDto })
  @IsOptional()
  @IsEnum(MaintenanceStatusDto)
  status?: MaintenanceStatusDto;

  @ApiPropertyOptional({ example: '2026-09-02' })
  @IsOptional()
  @IsDateString()
  service_date?: string;

  @ApiPropertyOptional({ example: 1750 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;
}
