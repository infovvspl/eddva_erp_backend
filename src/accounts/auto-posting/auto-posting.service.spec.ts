import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AutoPostingService } from './auto-posting.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { AccountMappingsService } from '../account-mappings/account-mappings.service';

describe('AutoPostingService', () => {
  let service: AutoPostingService;

  const mockVouchers = { createAndPostAuto: jest.fn() };
  const mockMappings = { resolve: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoPostingService,
        { provide: VouchersService, useValue: mockVouchers },
        { provide: AccountMappingsService, useValue: mockMappings },
      ],
    }).compile();
    service = module.get(AutoPostingService);
  });

  it('posts a Sales Invoice as a Journal debiting AR and crediting Sales Income, traceable to the invoice', async () => {
    mockMappings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'AR' ? 'acc-ar' : 'acc-income'));
    mockVouchers.createAndPostAuto.mockResolvedValue({ id: 'v-1', sourceModule: 'SALES_INVOICE', sourceReferenceId: 'inv-1' });

    const result = await service.postSalesInvoice({
      instituteId: 'inst-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'SI/2026-27/0001',
      invoiceDate: new Date('2026-09-03'),
      grandTotal: 118,
      userId: 'user-1',
    });

    expect(result?.sourceReferenceId).toBe('inv-1');
    expect(mockVouchers.createAndPostAuto).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceModule: 'SALES_INVOICE',
        sourceReferenceId: 'inv-1',
        userId: 'user-1',
        instituteId: 'inst-1',
        entries: [
          { accountId: 'acc-ar', debitAmount: 118, creditAmount: 0 },
          { accountId: 'acc-income', debitAmount: 0, creditAmount: 118 },
        ],
      }),
    );
  });

  it('does not throw when account mappings are not configured — logs and returns null instead of breaking the source module', async () => {
    mockMappings.resolve.mockRejectedValue(new BadRequestException('No ledger account is mapped to "AR"'));

    const result = await service.postSalesInvoice({
      instituteId: 'inst-1',
      invoiceId: 'inv-1',
      invoiceNumber: 'SI/2026-27/0001',
      invoiceDate: new Date('2026-09-03'),
      grandTotal: 118,
      userId: 'user-1',
    });

    expect(result).toBeNull();
    expect(mockVouchers.createAndPostAuto).not.toHaveBeenCalled();
  });

  it('posts a Purchase Invoice as a Journal debiting Purchase Expense and crediting AP', async () => {
    mockMappings.resolve.mockImplementation((key: string) => Promise.resolve(key === 'AP' ? 'acc-ap' : 'acc-expense'));
    mockVouchers.createAndPostAuto.mockResolvedValue({ id: 'v-2', sourceModule: 'PURCHASE_INVOICE', sourceReferenceId: 'pinv-1' });

    await service.postPurchaseInvoice({
      instituteId: 'inst-1',
      invoiceId: 'pinv-1',
      invoiceNumber: 'PI/2026-27/0001',
      invoiceDate: new Date('2026-09-03'),
      grandTotal: 500,
      userId: 'user-1',
    });

    expect(mockVouchers.createAndPostAuto).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceModule: 'PURCHASE_INVOICE',
        userId: 'user-1',
        instituteId: 'inst-1',
        entries: [
          { accountId: 'acc-expense', debitAmount: 500, creditAmount: 0 },
          { accountId: 'acc-ap', debitAmount: 0, creditAmount: 500 },
        ],
      }),
    );
  });
});
