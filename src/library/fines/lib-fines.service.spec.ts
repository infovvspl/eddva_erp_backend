import { Test, TestingModule } from '@nestjs/testing';
import { LibFinesService } from './lib-fines.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LibNotificationService } from '../notifications/lib-notification.service';
import { AutoPostingService } from '../../accounts/auto-posting/auto-posting.service';

describe('LibFinesService.pay — accounts auto-posting', () => {
  let service: LibFinesService;
  const fine = {
    fine_id: 4,
    institute_id: 'INST_1',
    status: 'pending',
    amount: 50,
    payments: [],
  };
  const payment = {
    payment_id: 7,
    fine_id: 4,
    amount_paid: 50,
    payment_date: new Date('2026-01-01'),
  };

  const mockPrisma = {
    libFine: { findFirst: jest.fn(), update: jest.fn() },
    libUser: { findUnique: jest.fn(), create: jest.fn() },
    libFinePayment: { create: jest.fn() },
  };
  const mockAutoPosting = { postLibraryFine: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.libFine.findFirst.mockResolvedValue(fine);
    mockPrisma.libUser.findUnique.mockResolvedValue({ user_id: 1 });
    mockPrisma.libFinePayment.create.mockResolvedValue(payment);
    mockPrisma.libFine.update.mockResolvedValue({ ...fine, status: 'paid' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibFinesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LibNotificationService, useValue: { sendFineAlert: jest.fn() } },
        { provide: AutoPostingService, useValue: mockAutoPosting },
      ],
    }).compile();
    service = module.get(LibFinesService);
  });

  it('posts the payment to the ledger after the fine status updates', async () => {
    await service.pay('INST_1', 4, {
      amount_paid: 50,
      payment_mode: 'cash' as any,
      received_by: 1,
    });

    expect(mockAutoPosting.postLibraryFine).toHaveBeenCalledWith({
      instituteId: 'INST_1',
      paymentId: 7,
      fineId: 4,
      paymentDate: payment.payment_date,
      amountPaid: 50,
      userId: '1',
    });
  });
});
