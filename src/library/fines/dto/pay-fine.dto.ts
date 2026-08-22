import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PaymentMode {
  cash = 'cash',
  card = 'card',
  upi = 'upi',
}

export class PayFineDto {
  @ApiProperty({ example: 50.00 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount_paid: number;

  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  payment_mode: PaymentMode;

  @ApiPropertyOptional({ example: 'TXN-2024-001' })
  @IsOptional()
  @IsString()
  transaction_ref?: string;

  @ApiProperty({ example: 1, description: 'user_id of librarian receiving payment' })
  @Type(() => Number)
  @IsNumber()
  received_by: number;
}
