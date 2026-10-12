import { PurchasesService } from './purchases.service';

describe('PurchasesService.create — accounts auto-posting', () => {
  const purchase = {
    purchase_id: 5,
    invoice_number: 'INV-100',
    purchase_date: new Date('2026-01-01'),
    total_amount: 500,
  };

  const mockPrisma = {
    invItem: { findFirst: jest.fn() },
    invVendor: { findFirst: jest.fn() },
    invLocation: { findFirst: jest.fn() },
    invStockPurchase: { create: jest.fn() },
    invItemVendor: { upsert: jest.fn() },
    invAssetUnit: { count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  const mockAudit = { log: jest.fn() };
  const mockLedger = { increment: jest.fn() };
  const mockAutoPosting = { postInventoryPurchase: jest.fn() };

  let service: PurchasesService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.invItem.findFirst.mockResolvedValue({ item_id: 1, item_type: 'consumable', item_code: 'ITM' });
    mockPrisma.invVendor.findFirst.mockResolvedValue({ vendor_id: 1 });
    mockPrisma.invLocation.findFirst.mockResolvedValue({ location_id: 1 });
    mockPrisma.invStockPurchase.create.mockResolvedValue(purchase);
    mockPrisma.invItemVendor.upsert.mockResolvedValue({});
    service = new PurchasesService(mockPrisma as any, mockAudit as any, mockLedger as any, mockAutoPosting as any);
  });

  it('posts the stock purchase to the ledger after it is recorded', async () => {
    await service.create('INST_1', {
      item_id: 1,
      vendor_id: 1,
      location_id: 1,
      quantity: 10,
      unit_price: 50,
      invoice_number: 'INV-100',
      purchase_date: '2026-01-01',
    } as any, 'USER_1');

    expect(mockAutoPosting.postInventoryPurchase).toHaveBeenCalledWith({
      instituteId: 'INST_1',
      purchaseId: 5,
      invoiceNumber: 'INV-100',
      purchaseDate: purchase.purchase_date,
      totalAmount: 500,
      userId: 'USER_1',
    });
  });
});
