import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, Min, IsEnum } from 'class-validator';
import { CanteenTopupMode } from '@prisma/client';

export class TopupCanteenWalletDto {
  @ApiProperty({ example: 500.0, minimum: 1 })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ enum: CanteenTopupMode, default: CanteenTopupMode.CASH })
  @IsOptional()
  @IsEnum(CanteenTopupMode)
  paymentMode?: CanteenTopupMode = CanteenTopupMode.CASH;

  @ApiPropertyOptional({ example: 'BANK-REF-992211' })
  @IsOptional()
  @IsString()
  transactionRef?: string;
}
