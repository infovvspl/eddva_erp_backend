import { Test, TestingModule } from '@nestjs/testing';
import { SpInvoiceStatus } from '@prisma/client';
import { SalesInvoicesService } from './sales-invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../numbering/numbering.service';
import { SalesPurchaseAuditService } from '../common/sales-purchase-audit.service';
import { CustomersService } from '../customers/customers.service';
import { ItemsService } from '../items/items.service';
import { AutoPostingService } from '../../accounts/auto-posting/auto-posting.service';

describe('SalesInvoicesService.post — accounts auto-posting', () => {
  let service: SalesInvoicesService;
  const draftInvoice = {
    si_id: 1,
    institute_id: 'INST_1',
    status: SpInvoiceStatus.DRAFT,
    sales_order_id: null,
    invoice_number: 'SI-0001',
    invoice_date: new Date('2026-01-01'),
    grand_total: 1000,
    items: [],
  };
  const postedInvoice = { ...draftInvoice, status: SpInvoiceStatus.POSTED };

  const mockPrisma = {
    spSalesInvoice: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  const mockAudit = { log: jest.fn() };
  const mockAutoPosting = {
    postSalesInvoice: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.spSalesInvoice.findFirst.mockResolvedValue(draftInvoice);
    mockPrisma.spSalesInvoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.spSalesInvoice.findUniqueOrThrow.mockResolvedValue(postedInvoice);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesInvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NumberingService, useValue: {} },
        { provide: SalesPurchaseAuditService, useValue: mockAudit },
        { provide: CustomersService, useValue: {} },
        { provide: ItemsService, useValue: {} },
        { provide: AutoPostingService, useValue: mockAutoPosting },
      ],
    }).compile();
    service = module.get(SalesInvoicesService);
  });

  it('posts the invoice to the ledger after the status flip commits', async () => {
    await service.post('INST_1', 1, 'USER_1');

    expect(mockAutoPosting.postSalesInvoice).toHaveBeenCalledWith({
      instituteId: 'INST_1',
      invoiceId: '1',
      invoiceNumber: 'SI-0001',
      invoiceDate: postedInvoice.invoice_date,
      grandTotal: 1000,
      userId: 'USER_1',
    });
  });
});
