import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeesService } from './fees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';

describe('FeesService', () => {
  let service: FeesService;

  const mockPrisma = {
    transportRoute: { findFirst: jest.fn() },
    transportFeePlan: { create: jest.fn(), findFirst: jest.fn() },
    transportPassenger: { findFirst: jest.fn() },
    transportPassengerFeeSubscription: { create: jest.fn(), findFirst: jest.fn() },
    transportFeePayment: { create: jest.fn() },
  };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TransportAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(FeesService);
  });

  describe('createFeePlan', () => {
    it('requires route_id when basis is "route"', async () => {
      await expect(
        service.createFeePlan('INST_1', { name: 'Plan', basis: 'route', amount: 100, billing_cycle: 'monthly' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.transportFeePlan.create).not.toHaveBeenCalled();
    });

    it('404s when the referenced route does not exist in this institute', async () => {
      mockPrisma.transportRoute.findFirst.mockResolvedValue(null);
      await expect(
        service.createFeePlan('INST_1', { name: 'Plan', basis: 'route', route_id: 99, amount: 100, billing_cycle: 'monthly' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not require route_id for a flat-basis plan', async () => {
      mockPrisma.transportFeePlan.create.mockResolvedValue({ fee_plan_id: 1 });
      await service.createFeePlan('INST_1', { name: 'Flat Plan', basis: 'flat', amount: 500, billing_cycle: 'monthly' } as any);
      expect(mockPrisma.transportFeePlan.create).toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    it('404s when the passenger does not belong to this institute', async () => {
      mockPrisma.transportPassenger.findFirst.mockResolvedValue(null);
      await expect(service.createSubscription('INST_1', 1, 1, { start_date: '2026-09-01' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordPayment', () => {
    it('404s when the subscription does not belong to a passenger in this institute', async () => {
      mockPrisma.transportPassengerFeeSubscription.findFirst.mockResolvedValue(null);
      await expect(
        service.recordPayment('INST_1', 1, { amount_paid: 100, payment_date: '2026-09-01', payment_mode: 'CASH' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.transportFeePayment.create).not.toHaveBeenCalled();
    });
  });
});
