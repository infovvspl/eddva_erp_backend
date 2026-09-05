import { Module } from '@nestjs/common';
import { AccountsAuditService } from './common/accounts-audit.service';
import { LedgerAccountsService } from './ledger-accounts/ledger-accounts.service';
import { FinancialYearsService } from './financial-years/financial-years.service';
import { VouchersService } from './vouchers/vouchers.service';
import { AccountMappingsService } from './account-mappings/account-mappings.service';
import { AutoPostingService } from './auto-posting/auto-posting.service';

/**
 * Holds only the providers AutoPostingService transitively depends on, with
 * no controllers of its own. Sales/Purchase import this instead of the full
 * AccountsModule so their (early) module registration doesn't drag in every
 * Accounts controller — which was pushing Accounts' Swagger tags up next to
 * Sales/Purchase regardless of where AccountsModule sat in AppModule's own
 * imports list, since Nest registers a module the first time it's reached
 * anywhere in the graph, not at its own listed position.
 */
@Module({
  providers: [AccountsAuditService, LedgerAccountsService, FinancialYearsService, VouchersService, AccountMappingsService, AutoPostingService],
  exports: [AccountsAuditService, LedgerAccountsService, FinancialYearsService, VouchersService, AccountMappingsService, AutoPostingService],
})
export class AccountsCoreModule {}
