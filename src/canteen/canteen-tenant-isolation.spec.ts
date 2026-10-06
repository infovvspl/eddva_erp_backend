import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CanteenMenuService } from './menu/canteen-menu.service';
import { CanteenMembersService } from './members/canteen-members.service';
import { CanteenPosService } from './pos/canteen-pos.service';
import { CanteenWalletService } from './wallet/canteen-wallet.service';
import { CanteenOrdersService } from './orders/canteen-orders.service';
import { CanteenPaymentsService } from './payments/canteen-payments.service';
import { CanteenReportsService } from './reports/canteen-reports.service';

const A = 'inst-a';
const B = 'inst-b';
const audit = { log: jest.fn() };
const numbering = { generateNextNumber: jest.fn().mockResolvedValue('00001') };

function model() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  };
}
function makePrisma() {
  const prisma: any = {
    canteenMenuCategory: model(),
    canteenMenuItem: model(),
    canteenMenuSchedule: model(),
    canteenMember: model(),
    canteenPosTerminal: model(),
    canteenPosShift: model(),
    canteenOrder: model(),
    canteenOrderItem: model(),
    canteenPayment: model(),
    canteenWallet: model(),
    canteenWalletTopup: model(),
    canteenWalletTransaction: model(),
    $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  };
  for (const m of Object.values(prisma) as any[]) {
    if (m && typeof m === 'object') {
      m.findFirst?.mockResolvedValue(null);
      m.findMany?.mockResolvedValue([]);
      m.findUnique?.mockResolvedValue(null);
      m.count?.mockResolvedValue(0);
      m.groupBy?.mockResolvedValue([]);
      m.aggregate?.mockResolvedValue({ _sum: {} });
    }
  }
  return prisma;
}

describe('Canteen tenant isolation', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
  });

  describe('a missing institute fails closed', () => {
    it.each(['', '   ', undefined, null])('refuses %p instead of running an unfiltered query', async (bad) => {
      const svc = new CanteenMenuService(prisma, audit as any);
      await expect(svc.getCategories(bad as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.canteenMenuCategory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('menu', () => {
    it('checks category name clashes per institute, not globally', async () => {
      prisma.canteenMenuCategory.create.mockResolvedValue({});
      const svc = new CanteenMenuService(prisma, audit as any);
      await svc.createCategory(A, { name: 'Snacks' } as any);
      expect(prisma.canteenMenuCategory.findFirst).toHaveBeenCalledWith({ where: { name: 'Snacks', instituteId: A } });
      expect(prisma.canteenMenuCategory.create.mock.calls[0][0].data.instituteId).toBe(A);
    });

    it('cannot read another institute\'s category or item', async () => {
      const svc = new CanteenMenuService(prisma, audit as any);
      await expect(svc.getCategoryById(B, 'c1')).rejects.toThrow(NotFoundException);
      await expect(svc.getItemById(B, 'i1')).rejects.toThrow(NotFoundException);
    });

    it('will not create an item in another institute\'s category', async () => {
      const svc = new CanteenMenuService(prisma, audit as any);
      await expect(svc.createItem(A, { categoryId: 'c9', name: 'Tea', price: 10 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.canteenMenuCategory.findFirst).toHaveBeenCalledWith({ where: { id: 'c9', instituteId: A }, include: { items: true } });
      expect(prisma.canteenMenuItem.create).not.toHaveBeenCalled();
    });
  });

  describe('members', () => {
    it('checks barcode clashes per institute and creates the wallet in the same institute', async () => {
      prisma.canteenMember.findFirst.mockResolvedValue(null);
      prisma.canteenMember.create.mockResolvedValue({ id: 'm1' });
      prisma.canteenMember.findUnique.mockResolvedValue({ id: 'm1', wallet: { id: 'w1' } });
      const svc = new CanteenMembersService(prisma, audit as any);
      await svc.createMember(A, { name: 'Asha', idCardBarcode: 'BC1' } as any);
      expect(prisma.canteenMember.findFirst).toHaveBeenCalledWith({ where: { idCardBarcode: 'BC1', instituteId: A } });
      expect(prisma.canteenMember.create.mock.calls[0][0].data.instituteId).toBe(A);
      expect(prisma.canteenWallet.create.mock.calls[0][0].data.instituteId).toBe(A);
    });

    it('cannot read or look up by barcode another institute\'s member', async () => {
      const svc = new CanteenMembersService(prisma, audit as any);
      await expect(svc.getMemberById(B, 'm1')).rejects.toThrow(NotFoundException);
      await expect(svc.getMemberByBarcode(B, 'BC1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('pos', () => {
    it('checks terminal name clashes per institute', async () => {
      prisma.canteenPosTerminal.create.mockResolvedValue({});
      const svc = new CanteenPosService(prisma, audit as any);
      await svc.createTerminal(A, { name: 'Counter 1' } as any);
      expect(prisma.canteenPosTerminal.findFirst).toHaveBeenCalledWith({ where: { name: 'Counter 1', instituteId: A } });
    });

    it('cannot open a shift on another institute\'s terminal', async () => {
      const svc = new CanteenPosService(prisma, audit as any);
      await expect(svc.openShift(A, { terminalId: 't9', openingCash: 100 } as any, 'u1')).rejects.toThrow(NotFoundException);
      expect(prisma.canteenPosShift.create).not.toHaveBeenCalled();
    });
  });

  describe('wallet', () => {
    it('will not create a wallet for another institute\'s member', async () => {
      const svc = new CanteenWalletService(prisma, audit as any);
      await expect(svc.createWallet(A, 'm9', {} as any)).rejects.toThrow(NotFoundException);
      expect(prisma.canteenMember.findFirst).toHaveBeenCalledWith({ where: { id: 'm9', instituteId: A } });
      expect(prisma.canteenWallet.create).not.toHaveBeenCalled();
    });

    it('cannot read another institute\'s wallet or top up it', async () => {
      const svc = new CanteenWalletService(prisma, audit as any);
      await expect(svc.getWalletById(B, 'w1')).rejects.toThrow(NotFoundException);
      await expect(svc.processTopup(B, 'w1', { amount: 10 } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('orders', () => {
    it('will not order against another institute\'s terminal, member, or menu item', async () => {
      const svc = new CanteenOrdersService(prisma, audit as any, numbering as any);
      await expect(svc.createOrder(A, { terminalId: 't9', items: [{ itemId: 'i1', quantity: 1 }] } as any, 'u1')).rejects.toThrow(NotFoundException);
      expect(prisma.canteenPosTerminal.findFirst).toHaveBeenCalledWith({ where: { id: 't9', instituteId: A } });
      expect(prisma.canteenOrder.create).not.toHaveBeenCalled();
    });

    it('stamps the order and its line items with the institute', async () => {
      prisma.canteenMenuItem.findMany.mockResolvedValue([{ id: 'i1', isAvailable: true, price: 50, taxRate: 0 }]);
      prisma.canteenOrder.create.mockResolvedValue({ id: 'o1' });
      const svc = new CanteenOrdersService(prisma, audit as any, numbering as any);
      await svc.createOrder(A, { items: [{ itemId: 'i1', quantity: 2 }] } as any, 'u1');
      const data = prisma.canteenOrder.create.mock.calls[0][0].data;
      expect(data.instituteId).toBe(A);
      expect(data.items.create[0].instituteId).toBe(A);
    });

    it('cannot read, update or cancel another institute\'s order', async () => {
      const svc = new CanteenOrdersService(prisma, audit as any, numbering as any);
      await expect(svc.getOrderById(B, 'o1')).rejects.toThrow(NotFoundException);
      await expect(svc.cancelOrder(B, 'o1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('payments', () => {
    it('cannot pay for or read another institute\'s order/payment', async () => {
      const svc = new CanteenPaymentsService(prisma, audit as any);
      await expect(svc.processPayment(B, 'o1', { amount: 10, paymentMode: 'CASH' } as any, 'u1')).rejects.toThrow(NotFoundException);
      expect(prisma.canteenOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', instituteId: B } }));
      await expect(svc.getPaymentById(B, 'p1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reports', () => {
    it('scopes every report query to the caller\'s institute', async () => {
      const svc = new CanteenReportsService(prisma);
      await svc.getSalesReport(A, {} as any);
      expect(prisma.canteenOrder.count.mock.calls[0][0].where.instituteId).toBe(A);
      expect(prisma.canteenPayment.groupBy.mock.calls[0][0].where.instituteId).toBe(A);

      await svc.getPaymentSummaryReport(A, {} as any);
      expect(prisma.canteenPayment.groupBy.mock.calls[1][0].where.instituteId).toBe(A);

      await svc.getShiftReport(A, {} as any);
      expect(prisma.canteenPosShift.findMany.mock.calls[0][0].where.instituteId).toBe(A);
    });

    it('refuses a report request with no institute', async () => {
      const svc = new CanteenReportsService(prisma);
      await expect(svc.getSalesReport('', {} as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.canteenOrder.count).not.toHaveBeenCalled();
    });
  });
});
