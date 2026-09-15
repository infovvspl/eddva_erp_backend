import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SpPaymentStatus } from '@prisma/client';

export class PurchaseRegisterQueryDto {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vendor_id?: number;

  @ApiPropertyOptional({ example: 'PI/2026-27/00012' })
  @IsOptional()
  @IsString()
  invoice_number?: string;

  @ApiPropertyOptional({ example: 'VEND-INV-98123' })
  @IsOptional()
  @IsString()
  vendor_invoice_number?: string;

  @ApiPropertyOptional({ enum: SpPaymentStatus })
  @IsOptional()
  @IsEnum(SpPaymentStatus)
  payment_status?: SpPaymentStatus;

  @ApiPropertyOptional({
    description: 'Matches invoice_number, vendor_invoice_number, vendor name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class SalesRegisterQueryDto {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;

  @ApiPropertyOptional({ example: 'SI/2026-27/00012' })
  @IsOptional()
  @IsString()
  invoice_number?: string;

  @ApiPropertyOptional({ enum: SpPaymentStatus })
  @IsOptional()
  @IsEnum(SpPaymentStatus)
  payment_status?: SpPaymentStatus;

  @ApiPropertyOptional({ description: 'Matches invoice_number, customer name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
