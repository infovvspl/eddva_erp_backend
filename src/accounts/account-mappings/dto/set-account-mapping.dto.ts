import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export const MAPPING_KEYS = [
  'AR',
  'AP',
  'SALES_INCOME',
  'PURCHASE_EXPENSE',
  'CASH',
  'BANK',
  'LIBRARY_FINE_INCOME',
  'CANTEEN_WALLET_LIABILITY',
  'TRANSPORT_FEE_INCOME',
  'HOSTEL_FEE_INCOME',
  'INVENTORY_ASSET',
  'SALARY_EXPENSE',
  'ADMISSION_FEE_INCOME',
  'TUITION_FEE_INCOME',
] as const;

export class SetAccountMappingDto {
  @ApiProperty({ enum: MAPPING_KEYS, description: 'Logical role this ledger account fills for auto-posting' })
  @IsIn(MAPPING_KEYS)
  mappingKey: (typeof MAPPING_KEYS)[number];

  @ApiProperty()
  @IsUUID()
  accountId: string;
}
