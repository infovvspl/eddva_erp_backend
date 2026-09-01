import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SubscriptionStatusDto {
  active = 'active',
  cancelled = 'cancelled',
  expired = 'expired',
}

export class CreateSubscriptionDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional({ enum: SubscriptionStatusDto, default: SubscriptionStatusDto.active })
  @IsOptional()
  @IsEnum(SubscriptionStatusDto)
  status?: SubscriptionStatusDto;
}
