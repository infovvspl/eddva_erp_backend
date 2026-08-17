import { Test, TestingModule } from '@nestjs/testing';
import { MatchService } from './match.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MatchService (3-Way Matching Engine)', () => {
  let service: MatchService;
  let prisma: PrismaService;

  const mockPrismaService = {
    purchaseInvoice: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return matched: true when invoice matches PO and GRN', async () => {
    mockPrismaService.purchaseInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      items: [
        { itemId: 'item-1', quantity: 10, unitPrice: 100, item: { itemName: 'Item 1', itemCode: 'I1' } },
      ],
      po: {
        poNumber: 'PO/2026-27/00001',
        items: [{ itemId: 'item-1', quantity: 10, unitPrice: 100 }],
      },
      grn: {
        items: [{ itemId: 'item-1', acceptedQty: 10 }],
      },
    });

    const result = await service.matchPurchaseInvoice('inv-1');
    expect(result.matched).toBe(true);
    expect(result.mismatches.length).toEqual(0);
  });

  it('should detect QUANTITY mismatch when invoice quantity exceeds GRN accepted quantity', async () => {
    mockPrismaService.purchaseInvoice.findUnique.mockResolvedValue({
      id: 'inv-2',
      items: [
        { itemId: 'item-1', quantity: 100, unitPrice: 100, item: { itemName: 'Steel Rod', itemCode: 'ST-01' } },
      ],
      po: {
        poNumber: 'PO/2026-27/00001',
        items: [{ itemId: 'item-1', quantity: 100, unitPrice: 100 }],
      },
      grn: {
        items: [{ itemId: 'item-1', acceptedQty: 90 }],
      },
    });

    const result = await service.matchPurchaseInvoice('inv-2');
    expect(result.matched).toBe(false);
    expect(result.mismatches.length).toEqual(1);
    expect(result.mismatches[0].type).toEqual('QUANTITY');
    expect(result.mismatches[0].difference).toEqual(10);
  });

  it('should detect PRICE mismatch when invoice unit price differs from PO price', async () => {
    mockPrismaService.purchaseInvoice.findUnique.mockResolvedValue({
      id: 'inv-3',
      items: [
        { itemId: 'item-1', quantity: 10, unitPrice: 150, item: { itemName: 'Pipe', itemCode: 'P1' } },
      ],
      po: {
        poNumber: 'PO/2026-27/00001',
        items: [{ itemId: 'item-1', quantity: 10, unitPrice: 100 }],
      },
      grn: {
        items: [{ itemId: 'item-1', acceptedQty: 10 }],
      },
    });

    const result = await service.matchPurchaseInvoice('inv-3');
    expect(result.matched).toBe(false);
    expect(result.mismatches.length).toEqual(1);
    expect(result.mismatches[0].type).toEqual('PRICE');
  });
});
