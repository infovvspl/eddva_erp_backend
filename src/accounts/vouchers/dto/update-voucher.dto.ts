import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VoucherEntryDto } from './voucher-entry.dto';

// voucherTypeCode and fyId are deliberately not editable here: the voucher
// number was already allocated against that specific (type, FY) pair when
// the draft was created. To change either, cancel the draft and create a
// new one — this keeps voucher numbering meaningful rather than silently
// reusing a number under a different type/year.
export class UpdateVoucherDto {
  @ApiPropertyOptional({ example: '2026-09-03' })
  @IsOptional()
  @IsDateString()
  voucherDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  narration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: [VoucherEntryDto], description: 'Full replacement of the entry set; at least one debit line and one credit line, totals must balance' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => VoucherEntryDto)
  entries?: VoucherEntryDto[];
}
