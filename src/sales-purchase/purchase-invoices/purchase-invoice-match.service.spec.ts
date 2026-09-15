import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PurchaseInvoiceMatchService } from './purchase-invoice-match.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../common/business-exception';

describe('PurchaseInvoiceMatchService', () => {
  let service: PurchaseInvoiceMatchService;
  const mockPrisma = {
    spPurchaseOrderItem: { findUnique: jest.fn() },
    spPurchaseInvoiceItem: { aggregate: jest.fn() },
    spGrnItem: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseInvoiceMatchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(PurchaseInvoiceMatchService);
  });

  it('passes when price and quantity are within the PO and GRN bounds', async () => {
    mockPrisma.spPurchaseOrderItem.findUnique.mockResolvedValue({
      po_item_id: 1,
      unit_price: 100,
      quantity: 10,
      received_qty: 10,
    });
    mockPrisma.spPurchaseInvoiceItem.aggregate.mockResolvedValue({
      _sum: { quantity: 0 },
    });
    mockPrisma.spGrnItem.findUnique.mockResolvedValue({
      grn_item_id: 1,
      accepted_qty: 9,
      received_qty: 10,
    });

    await expect(
      service.validate(mockPrisma as any, 0, [
        {
          item_id: 1,
          po_item_id: 1,
          grn_item_id: 1,
          quantity: 9,
          unit_price: 100,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects when invoice unit price does not match the approved PO price', async () => {
    mockPrisma.spPurchaseOrderItem.findUnique.mockResolvedValue({
      po_item_id: 1,
      unit_price: 100,
      quantity: 10,
      received_qty: 10,
    });

    await expect(
      service.validate(mockPrisma as any, 0, [
        { item_id: 1, po_item_id: 1, quantity: 5, unit_price: 999 },
      ]),
    ).rejects.toMatchObject({
      response: { error: 'PURCHASE_INVOICE_THREE_WAY_MATCH_FAILED' },
    });
  });

  it('rejects when cumulative invoiced quantity exceeds the ordered quantity', async () => {
    mockPrisma.spPurchaseOrderItem.findUnique.mockResolvedValue({
      po_item_id: 1,
      unit_price: 100,
      quantity: 10,
      received_qty: 10,
    });
    mockPrisma.spPurchaseInvoiceItem.aggregate.mockResolvedValue({
      _sum: { quantity: 8 },
    }); // already invoiced 8

    const promise = service.validate(mockPrisma as any, 99, [
      { item_id: 1, po_item_id: 1, quantity: 5, unit_price: 100 },
    ]); // +5 = 13 > 10
    await expect(promise).rejects.toBeInstanceOf(BusinessException);
    await expect(promise).rejects.toMatchObject({
      response: { details: { orderedQuantity: 10, invoicedQuantity: 13 } },
    });
  });

  it('rejects when cumulative invoiced quantity exceeds the GRN accepted quantity', async () => {
    mockPrisma.spPurchaseOrderItem.findUnique.mockResolvedValue({
      po_item_id: 1,
      unit_price: 100,
      quantity: 20,
      received_qty: 10,
    });
    mockPrisma.spPurchaseInvoiceItem.aggregate.mockResolvedValueOnce({
      _sum: { quantity: 0 },
    }); // PO-side check
    mockPrisma.spGrnItem.findUnique.mockResolvedValue({
      grn_item_id: 1,
      accepted_qty: 8,
      received_qty: 10,
    });
    mockPrisma.spPurchaseInvoiceItem.aggregate.mockResolvedValueOnce({
      _sum: { quantity: 6 },
    }); // GRN-side: already invoiced 6 of 8 accepted

    const promise = service.validate(mockPrisma as any, 0, [
      {
        item_id: 1,
        po_item_id: 1,
        grn_item_id: 1,
        quantity: 5,
        unit_price: 100,
      },
    ]); // +5 = 11 > 8 accepted
    await expect(promise).rejects.toMatchObject({
      response: {
        error: 'PURCHASE_INVOICE_THREE_WAY_MATCH_FAILED',
        details: { receivedQuantity: 8, invoicedQuantity: 11 },
      },
    });
  });

  it('throws NotFoundException for a PO item that does not exist', async () => {
    mockPrisma.spPurchaseOrderItem.findUnique.mockResolvedValue(null);
    await expect(
      service.validate(mockPrisma as any, 0, [
        { item_id: 1, po_item_id: 999, quantity: 1, unit_price: 1 },
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
