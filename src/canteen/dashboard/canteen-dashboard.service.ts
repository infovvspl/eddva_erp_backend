import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

const LIST_SIZE = 6;

export interface CanteenDashboardSummary {
  totals: {
    orders_today: number;
    revenue_today: number;
    unpaid_orders: number;
    active_members: number;
    open_shifts: number;
    wallet_balance_total: number;
  };
  top_items_today: Array<{ item_id: string; name: string; quantity_sold: number }>;
  recent_orders: Array<{
    order_id: string;
    order_number: string;
    member_name: string | null;
    total_amount: number;
    status: string;
    payment_status: string;
    created_at: Date;
  }>;
}

@Injectable()
export class CanteenDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every figure is limited to the caller's institute. */
  async getSummary(instituteId: string): Promise<CanteenDashboardSummary> {
    const instId = requireInstituteId(instituteId);
    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    const [
      ordersToday,
      revenueTodayAgg,
      unpaidOrders,
      activeMembers,
      openShifts,
      walletBalanceAgg,
      todaysOrderItems,
      recentOrders,
    ] = await Promise.all([
      this.prisma.canteenOrder.count({ where: { instituteId: instId, orderDate: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.canteenOrder.aggregate({
        where: { instituteId: instId, orderDate: { gte: todayStart, lt: todayEnd }, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
      this.prisma.canteenOrder.count({ where: { instituteId: instId, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } } }),
      this.prisma.canteenMember.count({ where: { instituteId: instId } }),
      this.prisma.canteenPosShift.count({ where: { instituteId: instId, status: 'OPEN' } }),
      this.prisma.canteenWallet.aggregate({ where: { instituteId: instId, status: 'ACTIVE' }, _sum: { balance: true } }),
      this.prisma.canteenOrderItem.groupBy({
        by: ['itemId'],
        where: { instituteId: instId, order: { orderDate: { gte: todayStart, lt: todayEnd } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: LIST_SIZE,
      }),
      this.prisma.canteenOrder.findMany({
        where: { instituteId: instId },
        include: { member: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: LIST_SIZE,
      }),
    ]);

    const items = await this.prisma.canteenMenuItem.findMany({
      where: { id: { in: todaysOrderItems.map((i) => i.itemId) }, instituteId: instId },
      select: { id: true, name: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i.name]));

    return {
      totals: {
        orders_today: ordersToday,
        revenue_today: Number(revenueTodayAgg._sum.totalAmount ?? 0),
        unpaid_orders: unpaidOrders,
        active_members: activeMembers,
        open_shifts: openShifts,
        wallet_balance_total: Number(walletBalanceAgg._sum.balance ?? 0),
      },
      top_items_today: todaysOrderItems
        .filter((i) => itemMap.has(i.itemId))
        .map((i) => ({
          item_id: i.itemId,
          name: itemMap.get(i.itemId) ?? 'Unknown',
          quantity_sold: Number(i._sum.quantity ?? 0),
        })),
      recent_orders: recentOrders.map((o) => ({
        order_id: o.id,
        order_number: o.orderNumber,
        member_name: o.member?.name ?? null,
        total_amount: Number(o.totalAmount),
        status: o.status,
        payment_status: o.paymentStatus,
        created_at: o.createdAt,
      })),
    };
  }
}
