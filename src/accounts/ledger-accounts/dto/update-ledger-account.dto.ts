import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLedgerAccountDto } from './create-ledger-account.dto';

// Opening balance is fixed at creation time; corrections to books already in
// use must flow through a journal voucher, not a silent edit of the opening figure.
export class UpdateLedgerAccountDto extends PartialType(
  OmitType(CreateLedgerAccountDto, ['openingBalance', 'openingBalanceType'] as const),
) {}
