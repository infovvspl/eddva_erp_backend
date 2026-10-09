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
 * Every metric is scoped to the caller's institute_id (Canteen tenant isolation).
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

  async getSummary(instituteId: string, from?: string, to?: string) {
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
      this.prisma.canteenMember.count({ where: { instituteId } }),
      this.prisma.canteenWallet.aggregate({ _sum: { balance: true }, where: { instituteId, status: 'ACTIVE' } }),
      this.prisma.canteenWallet.count({ where: { instituteId, status: 'ACTIVE' } }),
      this.prisma.canteenOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: { instituteId, orderDate: { gte: startOfToday() }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.canteenOrder.count({ where: { instituteId, paymentStatus: 'UNPAID' } }),
      this.prisma.canteenPosShift.count({ where: { instituteId, status: 'OPEN' } }),
      this.reports.getSalesReport(instituteId, query),
      this.reports.getItemSalesReport(instituteId, query),
      this.reports.getCategorySalesReport(instituteId, query),
      this.reports.getPaymentSummaryReport(instituteId, query),
      this.reports.getShiftReport(instituteId, query),
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
