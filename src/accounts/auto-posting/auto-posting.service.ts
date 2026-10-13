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

interface LibraryFinePaymentParams {
  instituteId: string;
  paymentId: number;
  fineId: number;
  paymentDate: Date;
  amountPaid: number;
  userId: string;
}

interface CanteenWalletTopupParams {
  instituteId: string;
  topupId: string;
  walletId: string;
  topupDate: Date;
  amount: number;
  userId: string;
}

interface TransportFeePaymentParams {
  instituteId: string;
  paymentId: number;
  subscriptionId: number;
  paymentDate: Date;
  amountPaid: number;
  userId: string;
}

interface HostelFeePaymentParams {
  instituteId: string;
  paymentId: number;
  invoiceId: number;
  paymentDate: Date;
  amountPaid: number;
  userId: string;
}

interface PayrollDisbursementParams {
  instituteId: string;
  payslipId: number;
  staffId: number;
  payDate: Date;
  netSalary: number;
  userId: string;
}

interface AdmissionFeePaymentParams {
  instituteId: string;
  paymentId: number;
  applicationId: number;
  paymentDate: Date;
  amountPaid: number;
  userId: string;
}

interface TuitionFeePaymentParams {
  instituteId: string;
  paymentId: number;
  studentId: number;
  paymentDate: Date;
  amountPaid: number;
  userId: string;
}

interface InventoryPurchaseParams {
  instituteId: string;
  purchaseId: number;
  invoiceNumber?: string | null;
  purchaseDate: Date;
  totalAmount: number;
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

  async postLibraryFine(params: LibraryFinePaymentParams) {
    try {
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);
      const incomeAccountId = await this.accountMappingsService.resolve('LIBRARY_FINE_INCOME', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'RECEIPT',
        voucherDate: params.paymentDate,
        narration: `Auto-posted from Library Fine #${params.fineId} payment #${params.paymentId}`,
        referenceNo: `LIB-FINE-${params.fineId}`,
        entries: [
          { accountId: cashAccountId, debitAmount: params.amountPaid, creditAmount: 0 },
          { accountId: incomeAccountId, debitAmount: 0, creditAmount: params.amountPaid },
        ],
        sourceModule: 'LIBRARY_FINE_PAYMENT',
        sourceReferenceId: String(params.paymentId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Library Fine payment #${params.paymentId}: ${err.message}`);
      return null;
    }
  }

  /**
   * A wallet top-up is cash received in exchange for a liability (credit the
   * member can later spend) — not income. Income gets recognized when the
   * balance is actually spent on food, which is a separate posting outside
   * this method's scope.
   */
  async postCanteenWalletTopup(params: CanteenWalletTopupParams) {
    try {
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);
      const liabilityAccountId = await this.accountMappingsService.resolve('CANTEEN_WALLET_LIABILITY', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'RECEIPT',
        voucherDate: params.topupDate,
        narration: `Auto-posted from Canteen Wallet Top-up #${params.topupId} (Wallet ${params.walletId})`,
        referenceNo: `CANTEEN-TOPUP-${params.topupId}`,
        entries: [
          { accountId: cashAccountId, debitAmount: params.amount, creditAmount: 0 },
          { accountId: liabilityAccountId, debitAmount: 0, creditAmount: params.amount },
        ],
        sourceModule: 'CANTEEN_WALLET_TOPUP',
        sourceReferenceId: params.topupId,
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Canteen Wallet Top-up #${params.topupId}: ${err.message}`);
      return null;
    }
  }

  async postTransportFeePayment(params: TransportFeePaymentParams) {
    try {
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);
      const incomeAccountId = await this.accountMappingsService.resolve('TRANSPORT_FEE_INCOME', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'RECEIPT',
        voucherDate: params.paymentDate,
        narration: `Auto-posted from Transport Fee Payment #${params.paymentId} (Subscription #${params.subscriptionId})`,
        referenceNo: `TRANSPORT-FEE-${params.paymentId}`,
        entries: [
          { accountId: cashAccountId, debitAmount: params.amountPaid, creditAmount: 0 },
          { accountId: incomeAccountId, debitAmount: 0, creditAmount: params.amountPaid },
        ],
        sourceModule: 'TRANSPORT_FEE_PAYMENT',
        sourceReferenceId: String(params.paymentId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Transport Fee Payment #${params.paymentId}: ${err.message}`);
      return null;
    }
  }

  async postHostelFeeInvoice(params: HostelFeePaymentParams) {
    try {
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);
      const incomeAccountId = await this.accountMappingsService.resolve('HOSTEL_FEE_INCOME', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'RECEIPT',
        voucherDate: params.paymentDate,
        narration: `Auto-posted from Hostel Fee Payment #${params.paymentId} (Invoice #${params.invoiceId})`,
        referenceNo: `HOSTEL-FEE-${params.paymentId}`,
        entries: [
          { accountId: cashAccountId, debitAmount: params.amountPaid, creditAmount: 0 },
          { accountId: incomeAccountId, debitAmount: 0, creditAmount: params.amountPaid },
        ],
        sourceModule: 'HOSTEL_FEE_PAYMENT',
        sourceReferenceId: String(params.paymentId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Hostel Fee Payment #${params.paymentId}: ${err.message}`);
      return null;
    }
  }

  async postAdmissionFee(params: AdmissionFeePaymentParams) {
    try {
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);
      const incomeAccountId = await this.accountMappingsService.resolve('ADMISSION_FEE_INCOME', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'RECEIPT',
        voucherDate: params.paymentDate,
        narration: `Auto-posted from Admission Fee payment #${params.paymentId} (Application #${params.applicationId})`,
        referenceNo: `ADM-FEE-${params.paymentId}`,
        entries: [
          { accountId: cashAccountId, debitAmount: params.amountPaid, creditAmount: 0 },
          { accountId: incomeAccountId, debitAmount: 0, creditAmount: params.amountPaid },
        ],
        sourceModule: 'ADMISSION_FEE_PAYMENT',
        sourceReferenceId: String(params.paymentId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Admission Fee payment #${params.paymentId}: ${err.message}`);
      return null;
    }
  }

  async postTuitionFeePayment(params: TuitionFeePaymentParams) {
    try {
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);
      const incomeAccountId = await this.accountMappingsService.resolve('TUITION_FEE_INCOME', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'RECEIPT',
        voucherDate: params.paymentDate,
        narration: `Auto-posted from Student Fee payment #${params.paymentId} (Student #${params.studentId})`,
        referenceNo: `STUFEE-${params.paymentId}`,
        entries: [
          { accountId: cashAccountId, debitAmount: params.amountPaid, creditAmount: 0 },
          { accountId: incomeAccountId, debitAmount: 0, creditAmount: params.amountPaid },
        ],
        sourceModule: 'STUDENT_FEE_PAYMENT',
        sourceReferenceId: String(params.paymentId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Student Fee payment #${params.paymentId}: ${err.message}`);
      return null;
    }
  }

  /**
   * A stock purchase is a vendor liability, not yet a cash outflow or an
   * expense — the item is still an asset sitting in inventory. Dr the
   * inventory asset account, Cr AP (the vendor is paid separately, outside
   * this method's scope, the same way Sales-Purchase's own AP settles).
   */
  async postInventoryPurchase(params: InventoryPurchaseParams) {
    try {
      const inventoryAccountId = await this.accountMappingsService.resolve('INVENTORY_ASSET', params.instituteId);
      const apAccountId = await this.accountMappingsService.resolve('AP', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'JOURNAL',
        voucherDate: params.purchaseDate,
        narration: `Auto-posted from Inventory Stock Purchase #${params.purchaseId}${params.invoiceNumber ? ` (Invoice ${params.invoiceNumber})` : ''}`,
        referenceNo: params.invoiceNumber ?? `INV-PURCHASE-${params.purchaseId}`,
        entries: [
          { accountId: inventoryAccountId, debitAmount: params.totalAmount, creditAmount: 0 },
          { accountId: apAccountId, debitAmount: 0, creditAmount: params.totalAmount },
        ],
        sourceModule: 'INVENTORY_STOCK_PURCHASE',
        sourceReferenceId: String(params.purchaseId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Inventory Stock Purchase #${params.purchaseId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Simplified payroll entry: no statutory deductions (PF/TDS) are modeled
   * yet, so the Loss-of-Pay-adjusted net salary is posted straight as the
   * expense — Dr SALARY_EXPENSE, Cr CASH, both equal to net_salary.
   */
  async postPayrollDisbursement(params: PayrollDisbursementParams) {
    try {
      const salaryExpenseAccountId = await this.accountMappingsService.resolve('SALARY_EXPENSE', params.instituteId);
      const cashAccountId = await this.accountMappingsService.resolve('CASH', params.instituteId);

      return await this.vouchersService.createAndPostAuto({
        voucherTypeCode: 'PAYMENT',
        voucherDate: params.payDate,
        narration: `Auto-posted from Payroll Payslip #${params.payslipId} (Staff #${params.staffId})`,
        referenceNo: `PAYSLIP-${params.payslipId}`,
        entries: [
          { accountId: salaryExpenseAccountId, debitAmount: params.netSalary, creditAmount: 0 },
          { accountId: cashAccountId, debitAmount: 0, creditAmount: params.netSalary },
        ],
        sourceModule: 'STAFF_PAYROLL_PAYSLIP',
        sourceReferenceId: String(params.payslipId),
        instituteId: params.instituteId,
        userId: params.userId,
      });
    } catch (err) {
      this.logger.warn(`Auto-posting skipped for Payroll Payslip #${params.payslipId}: ${err.message}`);
      return null;
    }
  }
}
