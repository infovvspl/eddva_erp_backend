import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export const MAPPING_KEYS = ['AR', 'AP', 'SALES_INCOME', 'PURCHASE_EXPENSE', 'CASH', 'BANK'] as const;

export class SetAccountMappingDto {
  @ApiProperty({ enum: MAPPING_KEYS, description: 'Logical role this ledger account fills for auto-posting' })
  @IsIn(MAPPING_KEYS)
  mappingKey: (typeof MAPPING_KEYS)[number];

  @ApiProperty()
  @IsUUID()
  accountId: string;
}
