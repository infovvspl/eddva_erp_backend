import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CanteenReportQueryDto } from './dto/canteen-report-query.dto';
import { CanteenOrderStatus, CanteenPaymentMode } from '@prisma/client';

@Injectable()
export class CanteenReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesReport(query: CanteenReportQueryDto) {
    const where: any = {};
    if (query.terminalId) where.terminalId = query.terminalId;
    if (query.dateFrom || query.dateTo) {
      where.orderDate = {};
      if (query.dateFrom) where.orderDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.orderDate.lte = new Date(query.dateTo);
    }

    const [totalOrders, completedOrders, cancelledOrders, totals] = await Promise.all([
      this.prisma.canteenOrder.count({ where }),
      this.prisma.canteenOrder.count({ where: { ...where, status: CanteenOrderStatus.COMPLETED } }),
      this.prisma.canteenOrder.count({ where: { ...where, status: CanteenOrderStatus.CANCELLED } }),
      this.prisma.canteenOrder.aggregate({
        where: { ...where, status: { not: CanteenOrderStatus.CANCELLED } },
        _sum: {
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
        },
      }),
    ]);

    // Aggregate payments by mode
    const paymentWhere: any = { status: 'success' };
    if (query.dateFrom || query.dateTo) {
      paymentWhere.paidAt = {};
      if (query.dateFrom) paymentWhere.paidAt.gte = new Date(query.dateFrom);
      if (query.dateTo) paymentWhere.paidAt.lte = new Date(query.dateTo);
    }
    if (query.terminalId) {
      paymentWhere.order = { terminalId: query.terminalId };
    }

    const modeSummary = await this.prisma.canteenPayment.groupBy({
      by: ['paymentMode'],
      where: paymentWhere,
      _sum: { amount: true },
      _count: true,
    });

    const modeMap: Record<string, number> = {
      CASH: 0,
      CARD: 0,
      UPI: 0,
      WALLET: 0,
    };
    for (const m of modeSummary) {
      modeMap[m.paymentMode] = Number(m._sum.amount || 0);
    }

    const grossSales = Number(totals._sum.subtotal || 0);
    const discount = Number(totals._sum.discountAmount || 0);
    const tax = Number(totals._sum.taxAmount || 0);
    const netSales = Number(totals._sum.totalAmount || 0);

    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      grossSales,
      discount,
      tax,
      netSales,
      cashSales: modeMap.CASH,
      cardSales: modeMap.CARD,
      upiSales: modeMap.UPI,
      walletSales: modeMap.WALLET,
    };
  }

  async getItemSalesReport(query: CanteenReportQueryDto) {
    const itemWhere: any = {};
    if (query.itemId) itemWhere.itemId = query.itemId;
    if (query.categoryId) itemWhere.item = { categoryId: query.categoryId };

    if (query.dateFrom || query.dateTo) {
      itemWhere.order = { orderDate: {} };
      if (query.dateFrom) itemWhere.order.orderDate.gte = new Date(query.dateFrom);
      if (query.dateTo) itemWhere.order.orderDate.lte = new Date(query.dateTo);
    }

    const itemSales = await this.prisma.canteenOrderItem.groupBy({
      by: ['itemId'],
      where: itemWhere,
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: { subtotal: 'desc' },
      },
    });

    const dbItems = await this.prisma.canteenMenuItem.findMany({
      where: { id: { in: itemSales.map((i) => i.itemId) } },
      include: { category: true },
    });
    const itemMap = new Map(dbItems.map((i) => [i.id, i]));

    return itemSales.map((is) => {
      const item = itemMap.get(is.itemId);
      return {
        itemId: is.itemId,
        itemName: item?.name || 'Unknown Item',
        categoryName: item?.category?.name || 'Uncategorized',
        quantitySold: Number(is._sum.quantity || 0),
        totalSales: Number(is._sum.subtotal || 0),
      };
    });
  }

  async getCategorySalesReport(query: CanteenReportQueryDto) {
    const itemSales = await this.getItemSalesReport(query);

    const categoryMap = new Map<string, { categoryName: string; totalItemsSold: number; totalSales: number }>();

    for (const row of itemSales) {
      const existing = categoryMap.get(row.categoryName) || {
        categoryName: row.categoryName,
        totalItemsSold: 0,
        totalSales: 0,
      };
      existing.totalItemsSold += row.quantitySold;
      existing.totalSales += row.totalSales;
      categoryMap.set(row.categoryName, existing);
    }

    return Array.from(categoryMap.values());
  }

  async getPaymentSummaryReport(query: CanteenReportQueryDto) {
    const paymentWhere: any = {};
    if (query.paymentMode) paymentWhere.paymentMode = query.paymentMode;
    if (query.dateFrom || query.dateTo) {
      paymentWhere.paidAt = {};
      if (query.dateFrom) paymentWhere.paidAt.gte = new Date(query.dateFrom);
      if (query.dateTo) paymentWhere.paidAt.lte = new Date(query.dateTo);
    }

    const summary = await this.prisma.canteenPayment.groupBy({
      by: ['paymentMode', 'status'],
      where: paymentWhere,
      _sum: { amount: true },
      _count: true,
    });

    return summary.map((s) => ({
      paymentMode: s.paymentMode,
      status: s.status,
      transactionCount: s._count,
      totalAmount: Number(s._sum.amount || 0),
    }));
  }

  async getShiftReport(query: CanteenReportQueryDto) {
    const where: any = {};
    if (query.terminalId) where.terminalId = query.terminalId;
    if (query.dateFrom || query.dateTo) {
      where.shiftStart = {};
      if (query.dateFrom) where.shiftStart.gte = new Date(query.dateFrom);
      if (query.dateTo) where.shiftStart.lte = new Date(query.dateTo);
    }

    const shifts = await this.prisma.canteenPosShift.findMany({
      where,
      include: {
        terminal: true,
        staff: { select: { id: true, name: true, email: true } },
      },
      orderBy: { shiftStart: 'desc' },
    });

    const totalShifts = shifts.length;
    const closedShifts = shifts.filter((s) => s.status === 'CLOSED');
    const totalVariance = closedShifts.reduce((sum, s) => sum + Number(s.variance || 0), 0);
    const totalOpeningCash = shifts.reduce((sum, s) => sum + Number(s.openingCash || 0), 0);
    const totalExpectedCash = closedShifts.reduce((sum, s) => sum + Number(s.expectedCash || 0), 0);
    const totalClosingCash = closedShifts.reduce((sum, s) => sum + Number(s.closingCash || 0), 0);

    return {
      summary: {
        totalShifts,
        closedShiftsCount: closedShifts.length,
        openShiftsCount: totalShifts - closedShifts.length,
        totalOpeningCash,
        totalExpectedCash,
        totalClosingCash,
        totalVariance,
      },
      shifts,
    };
  }
}
