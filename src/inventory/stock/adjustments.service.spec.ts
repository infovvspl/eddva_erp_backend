import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdjustmentsService } from './adjustments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryAuditService } from '../common/inventory-audit.service';
import { InventoryStockLedgerService } from '../common/inventory-stock-ledger.service';

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;
  const tx = { invStockAdjustment: { create: jest.fn() } };

  const mockPrisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    invItem: { findUnique: jest.fn().mockResolvedValue({ item_id: 1 }) },
    invLocation: { findUnique: jest.fn().mockResolvedValue({ location_id: 1 }) },
  };
  const mockAudit = { log: jest.fn() };
  const mockLedger = { increment: jest.fn(), decrement: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
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

  it('rejects a zero delta', async () => {
    await expect(service.create({ item_id: 1, location_id: 1, quantity_delta: 0, reason: 'damaged' } as any, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('routes a negative delta through the ledger decrement as adjustment_out', async () => {
    await service.create({ item_id: 1, location_id: 1, quantity_delta: -5, reason: 'damaged' } as any, 'user-1');
    expect(mockLedger.decrement).toHaveBeenCalledWith(tx, 'adjustment_out', expect.objectContaining({ quantity: 5 }));
    expect(mockLedger.increment).not.toHaveBeenCalled();
  });

  it('routes a positive delta through the ledger increment as adjustment_in', async () => {
    await service.create({ item_id: 1, location_id: 1, quantity_delta: 8, reason: 'audit_correction' } as any, 'user-1');
    expect(mockLedger.increment).toHaveBeenCalledWith(tx, 'adjustment_in', expect.objectContaining({ quantity: 8 }));
    expect(mockLedger.decrement).not.toHaveBeenCalled();
  });
});
