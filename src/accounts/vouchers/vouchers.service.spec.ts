import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { LedgerAccountsService } from '../ledger-accounts/ledger-accounts.service';
import { FinancialYearsService } from '../financial-years/financial-years.service';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';

const actor: AccountsPlatformUser = {
  eddva_user_id: 'user-1',
  institute_id: 'inst-1',
  user_name: 'Test Accountant',
  user_role: 'ACCOUNTANT',
  is_institute_admin: false,
};

describe('VouchersService', () => {
  let service: VouchersService;

  const mockTx = {
    $queryRaw: jest.fn().mockResolvedValue([{ currentNumber: 1 }]),
    voucher: { create: jest.fn(), update: jest.fn() },
    voucherEntry: { deleteMany: jest.fn(), updateMany: jest.fn() },
  };
  const mockPrisma = {
    voucherType: { findUnique: jest.fn() },
    voucher: { findFirst: jest.fn(), update: jest.fn() },
    costCenter: { findFirst: jest.fn() },
    financialYear: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockTx)),
  };
  const mockAudit = { log: jest.fn() };
  const mockLedgerAccounts = { assertPostable: jest.fn() };
  const mockFinancialYears = { findOne: jest.fn(), assertOpenAndDateInRange: jest.fn() };

  const openFy = {
    id: 'fy-1',
    fyLabel: '2026-27',
    status: 'OPEN',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    instituteId: 'inst-1',
  };
  const journalType = { id: 'vt-journal', code: 'JOURNAL', name: 'Journal Voucher', prefix: 'JRN-', isActive: true };

  const baseDto = {
    voucherTypeCode: 'JOURNAL' as const,
    fyId: 'fy-1',
    voucherDate: '2026-09-03',
    entries: [
      { accountId: 'acc-cash', debitAmount: 100, creditAmount: 0 },
      { accountId: 'acc-capital', debitAmount: 0, creditAmount: 100 },
    ],
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockTx.$queryRaw.mockResolvedValue([{ currentNumber: 1 }]);
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));
    mockPrisma.voucherType.findUnique.mockResolvedValue(journalType);
    mockFinancialYears.findOne.mockResolvedValue(openFy);
    mockFinancialYears.assertOpenAndDateInRange.mockResolvedValue(undefined);
    mockLedgerAccounts.assertPostable.mockResolvedValue({ id: 'acc', isActive: true, allowVoucherEntry: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountsAuditService, useValue: mockAudit },
        { provide: LedgerAccountsService, useValue: mockLedgerAccounts },
        { provide: FinancialYearsService, useValue: mockFinancialYears },
      ],
    }).compile();
    service = module.get(VouchersService);
  });

  describe('create', () => {
    it('creates a balanced draft voucher', async () => {
      mockTx.voucher.create.mockResolvedValue({ id: 'v-1', voucherNumber: 'JRN-00001', status: 'DRAFT', entries: [] });

      const result = await service.create(baseDto as any, actor);

      expect(mockTx.voucher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalDebit: 100, totalCredit: 100, status: 'DRAFT', createdBy: 'user-1' }),
        }),
      );
      expect(result.voucherNumber).toBe('JRN-00001');
    });

    it('rejects an unbalanced voucher', async () => {
      const dto = { ...baseDto, entries: [{ accountId: 'a', debitAmount: 100 }, { accountId: 'b', creditAmount: 50 }] };
      await expect(service.create(dto as any, actor)).rejects.toThrow(BadRequestException);
      expect(mockTx.voucher.create).not.toHaveBeenCalled();
    });

    it('rejects a debit-only voucher (no credit side)', async () => {
      const dto = { ...baseDto, entries: [{ accountId: 'a', debitAmount: 50 }, { accountId: 'b', debitAmount: 50 }] };
      await expect(service.create(dto as any, actor)).rejects.toThrow(BadRequestException);
    });

    it('rejects a credit-only voucher (no debit side)', async () => {
      const dto = { ...baseDto, entries: [{ accountId: 'a', creditAmount: 50 }, { accountId: 'b', creditAmount: 50 }] };
      await expect(service.create(dto as any, actor)).rejects.toThrow(BadRequestException);
    });

    it('rejects an entry that carries both a debit and a credit amount', async () => {
      const dto = { ...baseDto, entries: [{ accountId: 'a', debitAmount: 50, creditAmount: 50 }, { accountId: 'b', creditAmount: 50 }] };
      await expect(service.create(dto as any, actor)).rejects.toThrow(BadRequestException);
    });

    it('rejects when fewer than two entries are given', async () => {
      const dto = { ...baseDto, entries: [{ accountId: 'a', debitAmount: 50 }] };
      await expect(service.create(dto as any, actor)).rejects.toThrow(BadRequestException);
    });

    it('rejects an inactive or non-postable account', async () => {
      mockLedgerAccounts.assertPostable.mockRejectedValueOnce(new BadRequestException('Ledger account "X" is inactive'));
      await expect(service.create(baseDto as any, actor)).rejects.toThrow(BadRequestException);
    });

    it('rejects when the financial year is closed or the date is out of range', async () => {
      mockFinancialYears.assertOpenAndDateInRange.mockRejectedValueOnce(new BadRequestException('Financial year "2026-27" is closed'));
      await expect(service.create(baseDto as any, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const draftVoucher = {
      id: 'v-1',
      status: 'DRAFT',
      voucherNumber: 'JRN-00001',
      voucherDate: new Date('2026-09-03'),
      totalDebit: 100,
      totalCredit: 100,
      financialYear: openFy,
      entries: [
        { accountId: 'acc-cash', debitAmount: 100, creditAmount: 0, costCenterId: null, narration: null },
        { accountId: 'acc-capital', debitAmount: 0, creditAmount: 100, costCenterId: null, narration: null },
      ],
    };

    it('edits narration/date without touching entries when none are supplied', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue(draftVoucher);
      mockTx.voucher.update.mockResolvedValue({ id: 'v-1', narration: 'Updated' });

      await service.update('v-1', { narration: 'Updated' }, actor);

      expect(mockTx.voucherEntry.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.voucher.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ narration: 'Updated', totalDebit: 100, totalCredit: 100 }) }),
      );
    });

    it('replaces entries and re-validates the double-entry balance when entries are supplied', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue(draftVoucher);
      mockTx.voucher.update.mockResolvedValue({ id: 'v-1' });

      await service.update(
        'v-1',
        { entries: [{ accountId: 'acc-cash', debitAmount: 200 }, { accountId: 'acc-capital', creditAmount: 200 }] },
        actor,
      );

      expect(mockTx.voucherEntry.deleteMany).toHaveBeenCalledWith({ where: { voucherId: 'v-1' } });
      expect(mockTx.voucher.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalDebit: 200, totalCredit: 200 }) }),
      );
    });

    it('rejects an unbalanced entry replacement', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue(draftVoucher);
      await expect(
        service.update('v-1', { entries: [{ accountId: 'acc-cash', debitAmount: 200 }, { accountId: 'acc-capital', creditAmount: 100 }] }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects editing a voucher that is not in DRAFT status', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({ ...draftVoucher, status: 'POSTED' });
      await expect(service.update('v-1', { narration: 'x' }, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('post', () => {
    it('posts a balanced draft voucher', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({
        id: 'v-1',
        status: 'DRAFT',
        totalDebit: 100,
        totalCredit: 100,
        voucherDate: new Date('2026-09-03'),
        financialYear: openFy,
        entries: [{ accountId: 'acc-cash' }, { accountId: 'acc-capital' }],
      });
      mockTx.voucher.update.mockResolvedValue({ id: 'v-1', status: 'POSTED' });

      const result = await service.post('v-1', actor);
      expect(result.status).toBe('POSTED');
      expect(mockTx.voucher.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED', approvedBy: 'user-1' }) }),
      );
    });

    it('rejects posting a voucher that is not in DRAFT status', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({ id: 'v-1', status: 'POSTED', entries: [], financialYear: openFy, totalDebit: 100, totalCredit: 100 });
      await expect(service.post('v-1', actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels a draft voucher directly, with no reversal', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({ id: 'v-1', status: 'DRAFT', voucherNumber: 'JRN-00001', entries: [], financialYear: openFy });
      mockPrisma.voucher.update.mockResolvedValue({ id: 'v-1', status: 'CANCELLED' });

      const result = await service.cancel('v-1', {}, actor);
      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects cancelling an already-cancelled voucher', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({ id: 'v-1', status: 'CANCELLED', voucherNumber: 'JRN-00001' });
      await expect(service.cancel('v-1', {}, actor)).rejects.toThrow(ConflictException);
    });

    it('reverses a posted voucher with an equal-and-opposite voucher, leaving the original POSTED', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({
        id: 'v-1',
        voucherNumber: 'RCT-00001',
        status: 'POSTED',
        voucherTypeId: 'vt-receipt',
        totalDebit: 100,
        totalCredit: 100,
        isAutoPosted: false,
        reversedBy: null,
        entries: [
          { accountId: 'acc-cash', debitAmount: 100, creditAmount: 0, costCenterId: null, narration: null },
          { accountId: 'acc-capital', debitAmount: 0, creditAmount: 100, costCenterId: null, narration: null },
        ],
      });
      mockPrisma.financialYear.findFirst.mockResolvedValue(openFy); // findOpenFyForDate
      mockPrisma.voucherType.findUnique.mockResolvedValue({ id: 'vt-receipt', code: 'RECEIPT', prefix: 'RCT-', isActive: true });
      mockTx.voucher.create.mockResolvedValue({ id: 'v-2', voucherNumber: 'RCT-00002', status: 'POSTED', reversalOfId: 'v-1' });
      mockTx.voucher.update.mockResolvedValue({ id: 'v-1' });

      const result = await service.cancel('v-1', { reason: 'test' }, actor);

      expect(result.voucherNumber).toBe('RCT-00002');
      expect(mockTx.voucher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalDebit: 100, totalCredit: 100, status: 'POSTED', reversalOfId: 'v-1' }),
        }),
      );
      // original voucher gets a cancelledAt/cancelledBy marker, not a status change
      expect(mockTx.voucher.update).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { cancelledAt: expect.any(Date), cancelledBy: 'user-1' } });
    });

    it('rejects reversing a voucher that has already been reversed', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValue({ id: 'v-1', status: 'POSTED', voucherNumber: 'RCT-00001', reversedBy: { id: 'v-2', voucherNumber: 'RCT-00002' } });
      await expect(service.cancel('v-1', {}, actor)).rejects.toThrow(ConflictException);
    });
  });

  describe('createAndPostAuto', () => {
    const autoParams = {
      voucherTypeCode: 'JOURNAL' as const,
      voucherDate: new Date('2026-09-03T10:00:00.000Z'),
      entries: [
        { accountId: 'acc-ar', debitAmount: 118 },
        { accountId: 'acc-income', creditAmount: 118 },
      ],
      sourceModule: 'SALES_INVOICE',
      sourceReferenceId: 'inv-1',
      instituteId: 'inst-1',
      userId: 'user-1',
    };

    it('creates and immediately posts a system-generated voucher, traceable to its source', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValueOnce(null); // no existing auto-posted voucher for this source
      mockPrisma.financialYear.findFirst.mockResolvedValue(openFy);
      mockTx.voucher.create.mockResolvedValue({ id: 'v-3', voucherNumber: 'JRN-00001', status: 'POSTED', sourceModule: 'SALES_INVOICE', sourceReferenceId: 'inv-1' });

      const result = await service.createAndPostAuto(autoParams);

      expect(result.sourceModule).toBe('SALES_INVOICE');
      expect(mockTx.voucher.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED', isAutoPosted: true, sourceModule: 'SALES_INVOICE', sourceReferenceId: 'inv-1' }) }),
      );
    });

    it('is idempotent: a repeat call for the same source returns the existing voucher without creating a duplicate', async () => {
      mockPrisma.voucher.findFirst.mockResolvedValueOnce({ id: 'v-3', voucherNumber: 'JRN-00001', sourceModule: 'SALES_INVOICE', sourceReferenceId: 'inv-1' });

      const result = await service.createAndPostAuto(autoParams);

      expect(result.id).toBe('v-3');
      expect(mockTx.voucher.create).not.toHaveBeenCalled();
    });
  });
});
