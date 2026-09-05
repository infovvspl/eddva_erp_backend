import { Module } from '@nestjs/common';
import { AccountsAuthModule } from './auth/accounts-auth.module';
import { AccountsRolesPermissionsModule } from './roles-permissions/accounts-roles-permissions.module';
import { AccountsCoreModule } from './accounts-core.module';
import { AccountGroupsService } from './account-groups/account-groups.service';
import { AccountGroupsController } from './account-groups/account-groups.controller';
import { LedgerAccountsController } from './ledger-accounts/ledger-accounts.controller';
import { CostCentersService } from './cost-centers/cost-centers.service';
import { CostCentersController } from './cost-centers/cost-centers.controller';
import { FinancialYearsController } from './financial-years/financial-years.controller';
import { ClosingService } from './closing/closing.service';
import { VouchersController } from './vouchers/vouchers.controller';
import { LedgerService } from './ledger/ledger.service';
import { AccountsReportsController } from './ledger/reports.controller';
import { VoucherAttachmentsService } from './attachments/attachments.service';
import { VoucherAttachmentsController } from './attachments/attachments.controller';
import { AccountMappingsController } from './account-mappings/account-mappings.controller';

/**
 * Sales/Purchase depend only on AccountsCoreModule (no controllers) for
 * auto-posting — never on this module — so that AccountsModule's own
 * controllers register only when AppModule's imports list reaches them,
 * keeping Accounts' Swagger tags grouped where AccountsModule is actually
 * listed instead of wherever Sales/Purchase happen to sit.
 */
@Module({
  imports: [AccountsAuthModule, AccountsRolesPermissionsModule, AccountsCoreModule],
  controllers: [
    AccountGroupsController,
    LedgerAccountsController,
    CostCentersController,
    FinancialYearsController,
    VouchersController,
    AccountsReportsController,
    VoucherAttachmentsController,
    AccountMappingsController,
  ],
  providers: [AccountGroupsService, CostCentersService, ClosingService, LedgerService, VoucherAttachmentsService],
})
export class AccountsModule {}
