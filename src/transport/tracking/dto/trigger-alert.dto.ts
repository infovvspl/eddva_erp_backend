import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum GeofenceAlertTypeDto {
  route_deviation = 'route_deviation',
  speed_violation = 'speed_violation',
  stop_delay = 'stop_delay',
  sos = 'sos',
}

export class TriggerAlertDto {
  @ApiProperty({ enum: GeofenceAlertTypeDto, example: GeofenceAlertTypeDto.sos })
  @IsEnum(GeofenceAlertTypeDto)
  alert_type: GeofenceAlertTypeDto;
}
