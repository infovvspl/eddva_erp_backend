import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface OutstandingRow {
  outstanding_count: bigint;
  outstanding_amount: string | null;
  overdue_count: bigint;
  overdue_amount: string | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(from?: string, to?: string) {
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return Object.keys(range).length > 0 ? range : undefined;
  }

  /**
   * Sum of outstanding (grand_total - paid_amount) and overdue outstanding
   * across POSTED, not-fully-paid invoices for one institute — a single
   * query via Postgres FILTER, mirroring the raw-SQL aggregation style
   * Inventory's own dashboard uses for computed sums Prisma can't express.
   */
  private async outstandingSummary(table: 'sp_purchase_invoices' | 'sp_sales_invoices', instituteId: string) {
    const rows = await this.prisma.$queryRawUnsafe<OutstandingRow[]>(
      `SELECT
         COUNT(*) FILTER (WHERE payment_status != 'PAID') AS outstanding_count,
         COALESCE(SUM(grand_total - paid_amount) FILTER (WHERE payment_status != 'PAID'), 0) AS outstanding_amount,
         COUNT(*) FILTER (WHERE payment_status != 'PAID' AND due_date IS NOT NULL AND due_date < now()) AS overdue_count,
         COALESCE(SUM(grand_total - paid_amount) FILTER (WHERE payment_status != 'PAID' AND due_date IS NOT NULL AND due_date < now()), 0) AS overdue_amount
       FROM ${table}
       WHERE institute_id = $1 AND status = 'POSTED'`,
      instituteId,
    );
    const row = rows[0];
    return {
      outstanding_count: Number(row?.outstanding_count ?? 0),
      outstanding_amount: Number(row?.outstanding_amount ?? 0),
      overdue_count: Number(row?.overdue_count ?? 0),
      overdue_amount: Number(row?.overdue_amount ?? 0),
    };
  }

  async getSummary(instituteId: string, from?: string, to?: string) {
    const invoiceDateRange = this.dateRange(from, to);

    const [
      vendorCount,
      customerCount,
      activeItemCount,
      poByStatus,
      poPendingApproval,
      grnByStatus,
      soByStatus,
      purchaseOutstanding,
      salesOutstanding,
      purchasePeriodTotals,
      salesPeriodTotals,
      topVendorRows,
      topCustomerRows,
    ] = await Promise.all([
      this.prisma.spVendor.count({ where: { institute_id: instituteId, status: 'ACTIVE', deleted_at: null } }),
      this.prisma.spCustomer.count({ where: { institute_id: instituteId, status: 'ACTIVE', deleted_at: null } }),
      this.prisma.spItem.count({ where: { institute_id: instituteId, status: 'ACTIVE' } }),
      this.prisma.spPurchaseOrder.groupBy({ by: ['status'], where: { institute_id: instituteId }, _count: { _all: true } }),
      this.prisma.spPurchaseOrder.aggregate({
        where: { institute_id: instituteId, status: 'PENDING_APPROVAL' },
        _count: { _all: true },
        _sum: { grand_total: true },
      }),
      this.prisma.spGrn.groupBy({ by: ['status'], where: { institute_id: instituteId }, _count: { _all: true } }),
      this.prisma.spSalesOrder.groupBy({ by: ['status'], where: { institute_id: instituteId }, _count: { _all: true } }),
      this.outstandingSummary('sp_purchase_invoices', instituteId),
      this.outstandingSummary('sp_sales_invoices', instituteId),
      this.prisma.spPurchaseInvoice.aggregate({
        where: { institute_id: instituteId, status: 'POSTED', invoice_date: invoiceDateRange },
        _count: { _all: true },
        _sum: { subtotal: true, tax_amount: true, discount: true, grand_total: true },
      }),
      this.prisma.spSalesInvoice.aggregate({
        where: { institute_id: instituteId, status: 'POSTED', invoice_date: invoiceDateRange },
        _count: { _all: true },
        _sum: { subtotal: true, tax_amount: true, discount: true, grand_total: true },
      }),
      this.prisma.spPurchaseInvoice.groupBy({
        by: ['vendor_id'],
        where: { institute_id: instituteId, status: 'POSTED', invoice_date: invoiceDateRange },
        _sum: { grand_total: true },
        _count: { _all: true },
        orderBy: { _sum: { grand_total: 'desc' } },
        take: 5,
      }),
      this.prisma.spSalesInvoice.groupBy({
        by: ['customer_id'],
        where: { institute_id: instituteId, status: 'POSTED', invoice_date: invoiceDateRange },
        _sum: { grand_total: true },
        _count: { _all: true },
        orderBy: { _sum: { grand_total: 'desc' } },
        take: 5,
      }),
    ]);

    const [vendors, customers] = await Promise.all([
      this.prisma.spVendor.findMany({ where: { vendor_id: { in: topVendorRows.map((r) => r.vendor_id) } }, select: { vendor_id: true, vendor_name: true, vendor_code: true } }),
      this.prisma.spCustomer.findMany({ where: { customer_id: { in: topCustomerRows.map((r) => r.customer_id) } }, select: { customer_id: true, customer_name: true, customer_code: true } }),
    ]);
    const vendorMap = new Map(vendors.map((v) => [v.vendor_id, v]));
    const customerMap = new Map(customers.map((c) => [c.customer_id, c]));

    const grnStatusMap = Object.fromEntries(grnByStatus.map((r) => [r.status, r._count._all]));
    const poOpenStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED'];
    const soOpenStatuses = ['DRAFT', 'CONFIRMED', 'PARTIALLY_INVOICED'];

    return {
      range: { from: from ?? null, to: to ?? null },
      vendor_count: vendorCount,
      customer_count: customerCount,
      active_item_count: activeItemCount,
      purchase: {
        purchase_orders: {
          by_status: poByStatus.map((r) => ({ status: r.status, count: r._count._all })),
          open_count: poByStatus.filter((r) => poOpenStatuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0),
          pending_approval_count: poPendingApproval._count._all,
          pending_approval_value: Number(poPendingApproval._sum.grand_total ?? 0),
        },
        grns: {
          draft_count: grnStatusMap.DRAFT ?? 0,
          posted_count: grnStatusMap.POSTED ?? 0,
        },
        invoices: {
          period_count: purchasePeriodTotals._count._all,
          period_subtotal: Number(purchasePeriodTotals._sum.subtotal ?? 0),
          period_tax: Number(purchasePeriodTotals._sum.tax_amount ?? 0),
          period_discount: Number(purchasePeriodTotals._sum.discount ?? 0),
          period_grand_total: Number(purchasePeriodTotals._sum.grand_total ?? 0),
          ...purchaseOutstanding,
        },
        top_vendors: topVendorRows.map((r) => ({
          vendor_id: r.vendor_id,
          vendor_name: vendorMap.get(r.vendor_id)?.vendor_name ?? 'Unknown',
          vendor_code: vendorMap.get(r.vendor_id)?.vendor_code ?? null,
          invoice_count: r._count._all,
          total_amount: Number(r._sum.grand_total ?? 0),
        })),
      },
      sales: {
        sales_orders: {
          by_status: soByStatus.map((r) => ({ status: r.status, count: r._count._all })),
          open_count: soByStatus.filter((r) => soOpenStatuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0),
        },
        invoices: {
          period_count: salesPeriodTotals._count._all,
          period_subtotal: Number(salesPeriodTotals._sum.subtotal ?? 0),
          period_tax: Number(salesPeriodTotals._sum.tax_amount ?? 0),
          period_discount: Number(salesPeriodTotals._sum.discount ?? 0),
          period_grand_total: Number(salesPeriodTotals._sum.grand_total ?? 0),
          ...salesOutstanding,
        },
        top_customers: topCustomerRows.map((r) => ({
          customer_id: r.customer_id,
          customer_name: customerMap.get(r.customer_id)?.customer_name ?? 'Unknown',
          customer_code: customerMap.get(r.customer_id)?.customer_code ?? null,
          invoice_count: r._count._all,
          total_amount: Number(r._sum.grand_total ?? 0),
        })),
      },
    };
  }
}
