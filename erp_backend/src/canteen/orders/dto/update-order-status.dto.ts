import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { CanteenOrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: CanteenOrderStatus, example: CanteenOrderStatus.PREPARING })
  @IsNotEmpty()
  @IsEnum(CanteenOrderStatus)
  status: CanteenOrderStatus;
}
