import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories/categories.service';
import { LocationsService } from './locations/locations.service';
import { VendorsService } from './vendors/vendors.service';
import { ItemsService } from './items/items.service';
import { HoldersService } from './holders/holders.service';
import { PurchasesService } from './stock/purchases.service';
import { TransfersService } from './stock/transfers.service';
import { StockBalancesService } from './stock/stock-balances.service';
import { AssetUnitsService } from './assets/asset-units.service';
import { MaintenanceService } from './maintenance/maintenance.service';
import { AlertsService } from './alerts/alerts.service';
import { DashboardService } from './dashboard/dashboard.service';

const A = 'inst-a';
const B = 'inst-b';

function model() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  };
}
function makePrisma() {
  const prisma: any = {
    invCategory: model(),
    invLocation: model(),
    invVendor: model(),
    invItem: model(),
    invItemVendor: model(),
    invHolder: model(),
    invStockPurchase: model(),
    invStockTransfer: model(),
    invStockAdjustment: model(),
    invStockLedger: model(),
    invStockBalance: model(),
    invAssetUnit: model(),
    invAssetIssue: model(),
    invAssetMaintenance: model(),
    invApprovalRule: model(),
    $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
  for (const m of Object.values(prisma) as any[]) {
    if (m && typeof m === 'object') {
      m.findFirst?.mockResolvedValue(null);
      m.findMany?.mockResolvedValue([]);
      m.findUnique?.mockResolvedValue(null);
      m.count?.mockResolvedValue(0);
      m.groupBy?.mockResolvedValue([]);
    }
  }
  return prisma;
}
const audit = { log: jest.fn() };

describe('Inventory tenant isolation', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
  });

  describe('a missing institute fails closed', () => {
    it.each(['', '   ', undefined, null])('refuses %p instead of running an unfiltered query', async (bad) => {
      const svc = new CategoriesService(prisma, audit as any);
      await expect(svc.findAll(bad as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.invCategory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('categories, locations and vendors', () => {
    it('stamps new rows and filters lists by institute', async () => {
      prisma.invCategory.create.mockResolvedValue({});
      await new CategoriesService(prisma, audit as any).create(A, { name: 'Stationery' } as any);
      expect(prisma.invCategory.create.mock.calls[0][0].data.institute_id).toBe(A);

      await new LocationsService(prisma, audit as any).findAll(A);
      expect(prisma.invLocation.findMany.mock.calls[0][0].where.institute_id).toBe(A);
    });

    it('checks name clashes per institute, not globally', async () => {
      prisma.invLocation.create.mockResolvedValue({});
      await new LocationsService(prisma, audit as any).create(A, { name: 'Main Store' } as any);
      expect(prisma.invLocation.findFirst).toHaveBeenCalledWith({ where: { name: 'Main Store', institute_id: A } });
    });

    it('cannot read or update another institute\'s category, location or vendor', async () => {
      await expect(new CategoriesService(prisma, audit as any).findOne(B, 1)).rejects.toThrow(NotFoundException);
      await expect(new LocationsService(prisma, audit as any).findOne(B, 1)).rejects.toThrow(NotFoundException);
      await expect(new VendorsService(prisma, audit as any).findOne(B, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('items', () => {
    it('will not attach an item to another institute\'s category', async () => {
      const svc = new ItemsService(prisma, audit as any, {} as any);
      await expect(svc.create(A, { item_code: 'X1', name: 'x', category_id: 9 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.invCategory.findFirst).toHaveBeenCalledWith({ where: { category_id: 9, institute_id: A } });
      expect(prisma.invItem.create).not.toHaveBeenCalled();
    });

    it('checks the item code per institute', async () => {
      prisma.invCategory.findFirst.mockResolvedValue({ category_id: 1 });
      prisma.invItem.create.mockResolvedValue({});
      await new ItemsService(prisma, audit as any, {} as any).create(A, { item_code: 'X1', name: 'x', category_id: 1 } as any);
      expect(prisma.invItem.findFirst).toHaveBeenCalledWith({ where: { item_code: 'X1', institute_id: A } });
      expect(prisma.invItem.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot associate a vendor from another institute', async () => {
      const svc = new ItemsService(prisma, audit as any, {} as any);
      prisma.invItem.findFirst.mockResolvedValue({ item_id: 1 });
      prisma.invVendor.findFirst.mockResolvedValue(null);
      await expect(svc.upsertVendor(A, 1, { vendor_id: 5 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.invItemVendor.upsert).not.toHaveBeenCalled();
    });
  });

  describe('holders', () => {
    it('scopes current-issues to the institute', async () => {
      prisma.invHolder.findFirst.mockResolvedValue({ holder_id: 1 });
      await new HoldersService(prisma, audit as any).currentIssues(A, 1);
      expect(prisma.invAssetIssue.findMany.mock.calls[0][0].where).toMatchObject({ holder_id: 1, institute_id: A });
    });
  });

  describe('purchases and transfers', () => {
    const ledger = { increment: jest.fn(), decrement: jest.fn() };

    it('will not purchase against another institute\'s item, vendor or location', async () => {
      const svc = new PurchasesService(prisma, audit as any, ledger as any, { postInventoryPurchase: jest.fn() } as any);
      await expect(
        svc.create(B, { item_id: 1, vendor_id: 1, location_id: 1, quantity: 1, unit_price: 10, purchase_date: '2026-01-01' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invStockPurchase.create).not.toHaveBeenCalled();
    });

    it('stamps a purchase and its ledger movement with the institute', async () => {
      prisma.invItem.findFirst.mockResolvedValue({ item_id: 1, item_type: 'consumable', item_code: 'X' });
      prisma.invVendor.findFirst.mockResolvedValue({ vendor_id: 1 });
      prisma.invLocation.findFirst.mockResolvedValue({ location_id: 1 });
      prisma.invStockPurchase.create.mockResolvedValue({ purchase_id: 1 });
      await new PurchasesService(prisma, audit as any, ledger as any, { postInventoryPurchase: jest.fn() } as any).create(A, {
        item_id: 1, vendor_id: 1, location_id: 1, quantity: 1, unit_price: 10, purchase_date: '2026-01-01',
      } as any);
      expect(prisma.invStockPurchase.create.mock.calls[0][0].data.institute_id).toBe(A);
      expect(ledger.increment).toHaveBeenCalledWith(expect.anything(), 'purchase_in', expect.objectContaining({ institute_id: A }));
    });

    it('cannot transfer using another institute\'s locations', async () => {
      const svc = new TransfersService(prisma, audit as any, ledger as any);
      prisma.invItem.findFirst.mockResolvedValue({ item_id: 1 });
      await expect(
        svc.create(B, { item_id: 1, from_location_id: 1, to_location_id: 2, quantity: 1, transfer_date: '2026-01-01' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('stock balances and ledger', () => {
    it('scopes balances, ledger listing and reconciliation to the institute', async () => {
      const svc = new StockBalancesService(prisma);
      await svc.getBalances(A, {});
      expect(prisma.invStockBalance.findMany.mock.calls[0][0].where.institute_id).toBe(A);

      await svc.getLedger(A, {});
      expect(prisma.invStockLedger.findMany.mock.calls[0][0].where.institute_id).toBe(A);

      await svc.reconcile(A);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('WHERE institute_id = $1'), A);
    });
  });

  describe('asset units and maintenance', () => {
    it('a barcode lookup never resolves another institute\'s asset', async () => {
      await expect(new AssetUnitsService(prisma, audit as any).findByTag(B, 'TAG-1')).rejects.toThrow(NotFoundException);
      expect(prisma.invAssetUnit.findFirst.mock.calls[0][0].where).toEqual({ asset_tag: 'TAG-1', institute_id: B });
    });

    it('cannot report maintenance on another institute\'s asset unit', async () => {
      await expect(new MaintenanceService(prisma, audit as any).create(B, { asset_unit_id: 1, issue_reported: 'x' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.invAssetMaintenance.create).not.toHaveBeenCalled();
    });
  });

  describe('alerts and dashboard', () => {
    it('scopes low-stock and overdue-returns to the institute', async () => {
      const svc = new AlertsService(prisma);
      await svc.lowStock(A);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('i.institute_id = $1'), A);

      await svc.overdueReturns(A);
      expect(prisma.invAssetIssue.findMany.mock.calls[0][0].where.institute_id).toBe(A);
    });

    it('the dashboard summary is scoped to the institute', async () => {
      await new DashboardService(prisma).getSummary(A);
      expect(prisma.invItem.count.mock.calls[0][0].where.institute_id).toBe(A);
      expect(prisma.invStockBalance.groupBy.mock.calls[0][0].where.institute_id).toBe(A);
    });

    it('refuses a dashboard request with no institute', async () => {
      await expect(new DashboardService(prisma).getSummary('')).rejects.toThrow(ForbiddenException);
      expect(prisma.invItem.count).not.toHaveBeenCalled();
    });
  });
});
