import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelVoucherDto {
  @ApiPropertyOptional({ description: 'Reason for cancelling/reversing this voucher' })
  @IsOptional()
  @IsString()
  reason?: string;
}
