import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { CanteenPaymentMode } from '@prisma/client';

export class CreateCanteenPaymentDto {
  @ApiProperty({ enum: CanteenPaymentMode, example: CanteenPaymentMode.CASH })
  @IsNotEmpty()
  @IsEnum(CanteenPaymentMode)
  paymentMode: CanteenPaymentMode;

  @ApiProperty({ example: 140.0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'UPI-TXN-99882233' })
  @IsOptional()
  @IsString()
  transactionRef?: string;
}
