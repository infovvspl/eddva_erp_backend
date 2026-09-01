import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RecordPaymentDto {
  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount_paid: number;

  @ApiProperty({ example: '2026-09-05' })
  @IsDateString()
  payment_date: string;

  @ApiProperty({ example: 'UPI', enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER'] })
  @IsIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER'])
  payment_mode: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER';

  @ApiPropertyOptional({ example: 'TXN123456' })
  @IsOptional()
  @IsString()
  transaction_ref?: string;

  @ApiPropertyOptional({ example: 'INV-2026-0001' })
  @IsOptional()
  @IsString()
  invoice_id?: string;
}
