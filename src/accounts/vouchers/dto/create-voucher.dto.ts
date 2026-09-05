import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VoucherEntryDto } from './voucher-entry.dto';

export const VOUCHER_TYPE_CODES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'] as const;

export class CreateVoucherDto {
  @ApiProperty({ enum: VOUCHER_TYPE_CODES, example: 'PAYMENT' })
  @IsIn(VOUCHER_TYPE_CODES)
  voucherTypeCode: (typeof VOUCHER_TYPE_CODES)[number];

  @ApiProperty({ description: 'Financial year this voucher is dated within' })
  @IsUUID()
  fyId: string;

  @ApiProperty({ example: '2026-09-03' })
  @IsDateString()
  voucherDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  narration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiProperty({ type: [VoucherEntryDto], description: 'At least one debit line and one credit line; totals must balance' })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => VoucherEntryDto)
  entries: VoucherEntryDto[];
}
