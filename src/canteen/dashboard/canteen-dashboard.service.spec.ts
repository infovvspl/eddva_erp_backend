import { ForbiddenException } from '@nestjs/common';
import { CanteenDashboardService } from './canteen-dashboard.service';

function makePrisma() {
  return {
    canteenOrder: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    canteenMember: { count: jest.fn().mockResolvedValue(0) },
    canteenPosShift: { count: jest.fn().mockResolvedValue(0) },
    canteenWallet: { aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 0 } }) },
    canteenOrderItem: { groupBy: jest.fn().mockResolvedValue([]) },
    canteenMenuItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('CanteenDashboardService', () => {
  it('scopes every query to the caller\'s institute', async () => {
    const prisma = makePrisma();
    await new CanteenDashboardService(prisma as any).getSummary('inst-a');

    expect(prisma.canteenOrder.count.mock.calls[0][0].where.instituteId).toBe('inst-a');
    expect(prisma.canteenOrder.aggregate.mock.calls[0][0].where.instituteId).toBe('inst-a');
    expect(prisma.canteenMember.count.mock.calls[0][0].where.instituteId).toBe('inst-a');
    expect(prisma.canteenPosShift.count.mock.calls[0][0].where.instituteId).toBe('inst-a');
    expect(prisma.canteenWallet.aggregate.mock.calls[0][0].where.instituteId).toBe('inst-a');
    expect(prisma.canteenOrderItem.groupBy.mock.calls[0][0].where.instituteId).toBe('inst-a');
    expect(prisma.canteenOrder.findMany.mock.calls[0][0].where.instituteId).toBe('inst-a');
  });

  it('shapes the top items and recent orders lists', async () => {
    const prisma = makePrisma();
    prisma.canteenOrderItem.groupBy.mockResolvedValue([{ itemId: 'i1', _sum: { quantity: 5 } }]);
    prisma.canteenMenuItem.findMany.mockResolvedValue([{ id: 'i1', name: 'Samosa' }]);
    prisma.canteenOrder.findMany.mockResolvedValue([
      { id: 'o1', orderNumber: 'CNT-00001', member: { name: 'Asha' }, totalAmount: 120, status: 'PLACED', paymentStatus: 'UNPAID', createdAt: new Date('2026-09-29') },
    ]);

    const summary = await new CanteenDashboardService(prisma as any).getSummary('inst-a');

    expect(summary.top_items_today[0]).toMatchObject({ item_id: 'i1', name: 'Samosa', quantity_sold: 5 });
    expect(summary.recent_orders[0]).toMatchObject({ order_number: 'CNT-00001', member_name: 'Asha', total_amount: 120 });
  });

  it('refuses a session with no institute', async () => {
    const prisma = makePrisma();
    await expect(new CanteenDashboardService(prisma as any).getSummary('')).rejects.toThrow(ForbiddenException);
    expect(prisma.canteenOrder.count).not.toHaveBeenCalled();
  });
});
