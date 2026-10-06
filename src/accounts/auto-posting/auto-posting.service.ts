import { Injectable, Logger } from '@nestjs/common';
import { VouchersService } from '../vouchers/vouchers.service';
import { AccountMappingsService } from '../account-mappings/account-mappings.service';

interface SourceInvoiceParams {
  instituteId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  grandTotal: number;
  userId: string;
}

/**
 * Central integration point for other modules to record accounting impact
 * (section 12/19). Source modules must call these methods rather than
 * writing their own voucher/entry rows — this is what keeps voucher_entries
 * the single source of truth. Never throws into the caller's transaction:
 * a missing account mapping (Accounts not yet configured for this institute)
 * logs a warning and returns null rather than failing the source module's
 * own posting action, since Sales/Purchase must keep working independently
 * of whether Accounts has been set up yet.
 */
@Injectable()
export class AutoPostingService {
  private readonly logger = new Logger(AutoPostingService.name);

  constructor(
    private readonly vouchersService: VouchersService,
    private readonly accountMappingsService: AccountMappingsService,
  ) {}

  async postSalesInvoice(params: SourceInvoiceParams) {
    try {
      const arAccountId = await this.accountMappingsService.resolve('AR', params.instituteId);
      const incomeAccountId = await this.accountMappingsService.resolve('SALES_INCOME', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'JOURNAL',
        voucherDate: params.invoiceDate,
        narration: `Auto-posted from Sales Invoice ${params.invoiceNumber}`,
        referenceNo: params.invoiceNumber,
        entries: [
          { accountId: arAccountId, debitAmount: params.grandTotal, creditAmount: 0 },
          { accountId: incomeAccountId, debitAmount: 0, creditAmount: params.grandTotal },
        ],
        sourceModule: 'SALES_INVOICE',
        sourceReferenceId: params.invoiceId,
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Sales Invoice ${params.invoiceNumber}: ${err.message}`);
      return null;
    }
  }

  async postPurchaseInvoice(params: SourceInvoiceParams) {
    try {
      const apAccountId = await this.accountMappingsService.resolve('AP', params.instituteId);
      const expenseAccountId = await this.accountMappingsService.resolve('PURCHASE_EXPENSE', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'JOURNAL',
        voucherDate: params.invoiceDate,
        narration: `Auto-posted from Purchase Invoice ${params.invoiceNumber}`,
        referenceNo: params.invoiceNumber,
        entries: [
          { accountId: expenseAccountId, debitAmount: params.grandTotal, creditAmount: 0 },
          { accountId: apAccountId, debitAmount: 0, creditAmount: params.grandTotal },
        ],
        sourceModule: 'PURCHASE_INVOICE',
        sourceReferenceId: params.invoiceId,
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Purchase Invoice ${params.invoiceNumber}: ${err.message}`);
      return null;
    }
  }
}
