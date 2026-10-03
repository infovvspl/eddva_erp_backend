import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';

const INST = 'inst-1';

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;
  const tx = { invStockAdjustment: { create: jest.fn() } };

  const mockPrisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    invItem: { findFirst: jest.fn().mockResolvedValue({ item_id: 1 }) },
    invLocation: { findFirst: jest.fn().mockResolvedValue({ location_id: 1 }) },
  };
  const mockAudit = { log: jest.fn() };
  const mockLedger = { increment: jest.fn(), decrement: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.invItem.findFirst.mockResolvedValue({ item_id: 1 });
    mockPrisma.invLocation.findFirst.mockResolvedValue({ location_id: 1 });
    tx.invStockAdjustment.create.mockResolvedValue({ adjustment_id: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdjustmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryAuditService, useValue: mockAudit },
        { provide: InventoryStockLedgerService, useValue: mockLedger },
      ],
    }).compile();
    service = module.get(AdjustmentsService);
  });

  it('refuses a missing institute instead of running an unfiltered query', async () => {
    await expect(service.create('', { item_id: 1, location_id: 1, quantity_delta: -5, reason: 'damaged' } as any, 'user-1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.invItem.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a zero delta', async () => {
    await expect(service.create(INST, { item_id: 1, location_id: 1, quantity_delta: 0, reason: 'damaged' } as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('cannot adjust another institute\'s item or location', async () => {
    mockPrisma.invItem.findFirst.mockResolvedValue(null);
    await expect(service.create(INST, { item_id: 1, location_id: 1, quantity_delta: -5, reason: 'damaged' } as any, 'user-1')).rejects.toThrow(NotFoundException);
    expect(mockPrisma.invItem.findFirst).toHaveBeenCalledWith({ where: { item_id: 1, institute_id: INST } });
  });

  it('routes a negative delta through the ledger decrement as adjustment_out', async () => {
    await service.create(INST, { item_id: 1, location_id: 1, quantity_delta: -5, reason: 'damaged' } as any, 'user-1');
    expect(mockLedger.decrement).toHaveBeenCalledWith(tx, 'adjustment_out', expect.objectContaining({ institute_id: INST, quantity: 5 }));
    expect(mockLedger.increment).not.toHaveBeenCalled();
  });

  it('routes a positive delta through the ledger increment as adjustment_in', async () => {
    await service.create(INST, { item_id: 1, location_id: 1, quantity_delta: 8, reason: 'audit_correction' } as any, 'user-1');
    expect(mockLedger.increment).toHaveBeenCalledWith(tx, 'adjustment_in', expect.objectContaining({ institute_id: INST, quantity: 8 }));
    expect(mockLedger.decrement).not.toHaveBeenCalled();
  });
});
