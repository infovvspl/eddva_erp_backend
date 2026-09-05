import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BalanceType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLedgerAccountDto {
  @ApiProperty({ example: 'CASH-001' })
  @IsString()
  @IsNotEmpty()
  accountCode: string;

  @ApiProperty({ example: 'Cash in Hand' })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({ description: 'Account group this ledger account reports under' })
  @IsUUID()
  groupId: string;

  @ApiPropertyOptional({ default: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance?: number = 0;

  @ApiPropertyOptional({ enum: BalanceType, default: BalanceType.DEBIT })
  @IsOptional()
  @IsEnum(BalanceType)
  openingBalanceType?: BalanceType = BalanceType.DEBIT;

  @ApiPropertyOptional({ default: true, description: 'Whether vouchers may post directly to this account (leaf account)' })
  @IsOptional()
  @IsBoolean()
  allowVoucherEntry?: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ default: false, description: 'Marks this as a physical cash account, for the Cash Book report' })
  @IsOptional()
  @IsBoolean()
  isCashAccount?: boolean = false;

  @ApiPropertyOptional({ default: false, description: 'Marks this as a bank account, for the Bank Book report' })
  @IsOptional()
  @IsBoolean()
  isBankAccount?: boolean = false;
}
