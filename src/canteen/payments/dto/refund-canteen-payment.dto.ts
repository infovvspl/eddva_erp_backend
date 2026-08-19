import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefundCanteenPaymentDto {
  @ApiPropertyOptional({ example: 'Customer returned item' })
  @IsOptional()
  @IsString()
  reason?: string;
}
