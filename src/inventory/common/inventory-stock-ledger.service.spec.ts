import { ConflictException } from '@nestjs/common';
import { InventoryStockLedgerService } from './inventory-stock-ledger.service';

describe('InventoryStockLedgerService', () => {
  let service: InventoryStockLedgerService;
  let tx: any;

  beforeEach(() => {
    service = new InventoryStockLedgerService();
    tx = {
      $queryRawUnsafe: jest.fn(),
      invStockLedger: { create: jest.fn() },
    };
  });

  describe('increment', () => {
    it('upserts the balance atomically and writes a ledger row with the returned balance_after', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ quantity: 100 }]);

      const result = await service.increment(tx, 'purchase_in', {
        item_id: 1,
        location_id: 1,
        quantity: 100,
        reference_type: 'purchase',
        reference_id: 5,
        purchase_id: 5,
      });

      expect(result).toBe(100);
      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), 1, 1, 100);
      expect(tx.invStockLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ transaction_type: 'purchase_in', quantity: 100, balance_after: 100 }) }),
      );
    });

    it('rejects a non-positive quantity before touching the database', async () => {
      await expect(
        service.increment(tx, 'purchase_in', { item_id: 1, location_id: 1, quantity: 0, reference_type: 'purchase', reference_id: 1 }),
      ).rejects.toThrow(ConflictException);
      expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('decrement', () => {
    it('rejects when the conditional UPDATE affects zero rows (insufficient stock)', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([]);

      await expect(
        service.decrement(tx, 'issue_out', { item_id: 1, location_id: 1, quantity: 1000, reference_type: 'issue', reference_id: 1 }),
      ).rejects.toThrow(ConflictException);
      expect(tx.invStockLedger.create).not.toHaveBeenCalled();
    });

    it('applies the decrement and writes the ledger row when stock is sufficient', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ quantity: 90 }]);

      const result = await service.decrement(tx, 'issue_out', {
        item_id: 1,
        location_id: 1,
        quantity: 10,
        reference_type: 'issue',
        reference_id: 1,
        issue_id: 1,
      });

      expect(result).toBe(90);
      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('quantity >= $3'), 1, 1, 10);
    });
  });
});
