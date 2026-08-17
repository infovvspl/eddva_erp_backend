import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { CanteenWalletStatus } from '@prisma/client';

export class UpdateCanteenWalletDto {
  @ApiPropertyOptional({ enum: CanteenWalletStatus })
  @IsOptional()
  @IsEnum(CanteenWalletStatus)
  status?: CanteenWalletStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailySpendLimit?: number;
}
