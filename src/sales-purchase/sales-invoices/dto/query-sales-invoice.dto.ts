import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SpInvoiceStatus, SpPaymentStatus } from '@prisma/client';

export class QuerySalesInvoiceDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Matches invoice_number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SpInvoiceStatus })
  @IsOptional()
  @IsEnum(SpInvoiceStatus)
  status?: SpInvoiceStatus;

  @ApiPropertyOptional({ enum: SpPaymentStatus })
  @IsOptional()
  @IsEnum(SpPaymentStatus)
  payment_status?: SpPaymentStatus;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
