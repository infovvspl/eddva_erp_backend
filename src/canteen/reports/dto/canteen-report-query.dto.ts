import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { CanteenPaymentMode } from '@prisma/client';

export class CanteenReportQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminalId?: string;

  @ApiPropertyOptional({ enum: CanteenPaymentMode })
  @IsOptional()
  @IsEnum(CanteenPaymentMode)
  paymentMode?: CanteenPaymentMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemId?: string;
}
