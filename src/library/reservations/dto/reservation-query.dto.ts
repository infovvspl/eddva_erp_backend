import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ReservationStatusEnum {
  pending = 'pending',
  ready_for_pickup = 'ready_for_pickup',
  fulfilled = 'fulfilled',
  cancelled = 'cancelled',
  expired = 'expired',
}

export class ReservationQueryDto {
  @ApiPropertyOptional({
    enum: ReservationStatusEnum,
    description: 'Optional status filter: pending, ready_for_pickup, fulfilled, cancelled, expired',
  })
  @IsOptional()
  @IsEnum(ReservationStatusEnum)
  status?: ReservationStatusEnum;
}
