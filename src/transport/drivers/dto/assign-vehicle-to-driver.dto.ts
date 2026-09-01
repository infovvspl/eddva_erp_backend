import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignVehicleToDriverDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  assigned_from: string;
}
