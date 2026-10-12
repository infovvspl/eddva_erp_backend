import { Test, TestingModule } from '@nestjs/testing';
import { CanteenWalletService } from './canteen-wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CanteenAuditService } from '../common/canteen-audit.service';
import { AutoPostingService } from '../../accounts/auto-posting/auto-posting.service';
import { CanteenWalletStatus } from '@prisma/client';

describe('CanteenWalletService.processTopup — accounts auto-posting', () => {
  let service: CanteenWalletService;
  const wallet = {
    id: 'w1',
    instituteId: 'INST_1',
    status: CanteenWalletStatus.ACTIVE,
    balance: 100,
  };
  const topup = {
    id: 't1',
    walletId: 'w1',
    amount: 50,
    topupDate: new Date('2026-01-01'),
  };

  const mockPrisma = {
    canteenWallet: { findFirst: jest.fn(), update: jest.fn() },
    canteenWalletTopup: { create: jest.fn() },
    canteenWalletTransaction: { create: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  const mockAudit = { log: jest.fn() };
  const mockAutoPosting = { postCanteenWalletTopup: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.canteenWallet.findFirst.mockResolvedValue({ ...wallet, member: {}, transactions: [] });
    mockPrisma.canteenWalletTopup.create.mockResolvedValue(topup);
    mockPrisma.canteenWallet.update.mockResolvedValue({ ...wallet, balance: 150 });
    mockPrisma.canteenWalletTransaction.create.mockResolvedValue({ id: 'ledger1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanteenWalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CanteenAuditService, useValue: mockAudit },
        { provide: AutoPostingService, useValue: mockAutoPosting },
      ],
    }).compile();
    service = module.get(CanteenWalletService);
  });

  it('posts the top-up to the ledger after the transaction commits', async () => {
    await service.processTopup('INST_1', 'w1', { amount: 50, paymentMode: 'CASH' } as any, 'approver1');

    expect(mockAutoPosting.postCanteenWalletTopup).toHaveBeenCalledWith({
      instituteId: 'INST_1',
      topupId: 't1',
      walletId: 'w1',
      topupDate: topup.topupDate,
      amount: 50,
      userId: 'approver1',
    });
  });
});
