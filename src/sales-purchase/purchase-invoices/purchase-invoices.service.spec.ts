import { Test, TestingModule } from '@nestjs/testing';
import { SpInvoiceStatus } from '@prisma/client';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { VendorsService } from '../vendors/vendors.service';
import { ItemsService } from '../items/items.service';
import { PurchaseInvoiceMatchService } from './purchase-invoice-match.service';
import { AutoPostingService } from '../../accounts/auto-posting/auto-posting.service';

describe('PurchaseInvoicesService.post — accounts auto-posting', () => {
  let service: PurchaseInvoicesService;
  const draftInvoice = {
    pi_id: 1,
    institute_id: 'INST_1',
    status: SpInvoiceStatus.DRAFT,
    purchase_order_id: null,
    grn_id: null,
    invoice_number: 'PI-0001',
    invoice_date: new Date('2026-01-01'),
    grand_total: 2000,
    items: [],
  };
  const postedInvoice = { ...draftInvoice, status: SpInvoiceStatus.POSTED };

  const mockPrisma = {
    spPurchaseInvoice: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  const mockAudit = { log: jest.fn() };
  const mockMatch = { validate: jest.fn() };
  const mockAutoPosting = {
    postPurchaseInvoice: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.spPurchaseInvoice.findFirst.mockResolvedValue(draftInvoice);
    mockPrisma.spPurchaseInvoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.spPurchaseInvoice.findUniqueOrThrow.mockResolvedValue(postedInvoice);
    mockMatch.validate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseInvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NumberingService, useValue: {} },
        { provide: SalesPurchaseAuditService, useValue: mockAudit },
        { provide: VendorsService, useValue: {} },
        { provide: ItemsService, useValue: {} },
        { provide: PurchaseInvoiceMatchService, useValue: mockMatch },
        { provide: AutoPostingService, useValue: mockAutoPosting },
      ],
    }).compile();
    service = module.get(PurchaseInvoicesService);
  });

  it('posts the invoice to the ledger after the status flip commits', async () => {
    await service.post('INST_1', 1, 'USER_1');

    expect(mockAutoPosting.postPurchaseInvoice).toHaveBeenCalledWith({
      instituteId: 'INST_1',
      invoiceId: '1',
      invoiceNumber: 'PI-0001',
      invoiceDate: postedInvoice.invoice_date,
      grandTotal: 2000,
      userId: 'USER_1',
    });
  });
});
