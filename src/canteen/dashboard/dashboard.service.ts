import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CanteenReportsService } from '../reports/canteen-reports.service';
import { CanteenReportQueryDto } from '../reports/dto/canteen-report-query.dto';

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Canteen models have no institute_id field (not institute-scoped), same as
 * Front-Office/Inventory/Library/Sports — all metrics are platform-wide.
 *
 * Reuses CanteenReportsService's existing report methods rather than
 * duplicating their queries — the "orders"/"top_items"/"category_sales"/
 * "payment_summary" sections below are exactly what canteen-reports.service.ts
 * already computes for the standalone reports API, just composed here.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: CanteenReportsService,
  ) {}

  async getSummary(from?: string, to?: string) {
    const query: CanteenReportQueryDto = { dateFrom: from, dateTo: to };

    const [
      totalMembers,
      walletTotals,
      activeWallets,
      todaysOrders,
      unpaidOrders,
      activeShifts,
      salesReport,
      itemSalesReport,
      categorySalesReport,
      paymentSummary,
      shiftReport,
    ] = await Promise.all([
      this.prisma.canteenMember.count(),
      this.prisma.canteenWallet.aggregate({ _sum: { balance: true }, where: { status: 'ACTIVE' } }),
      this.prisma.canteenWallet.count({ where: { status: 'ACTIVE' } }),
      this.prisma.canteenOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: { orderDate: { gte: startOfToday() }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.canteenOrder.count({ where: { paymentStatus: 'UNPAID' } }),
      this.prisma.canteenPosShift.count({ where: { status: 'OPEN' } }),
      this.reports.getSalesReport(query),
      this.reports.getItemSalesReport(query),
      this.reports.getCategorySalesReport(query),
      this.reports.getPaymentSummaryReport(query),
      this.reports.getShiftReport(query),
    ]);

    return {
      range: { from: from ?? null, to: to ?? null },
      members: {
        total_members: totalMembers,
        active_wallets: activeWallets,
        total_active_wallet_balance: Number(walletTotals._sum.balance ?? 0),
      },
      today: {
        order_count: todaysOrders._count._all,
        revenue: Number(todaysOrders._sum.totalAmount ?? 0),
        unpaid_orders: unpaidOrders,
      },
      orders: salesReport,
      top_items: itemSalesReport.slice(0, 10),
      category_sales: categorySalesReport,
      payment_summary: paymentSummary,
      pos: {
        active_shifts: activeShifts,
        ...shiftReport.summary,
      },
    };
  }
}
