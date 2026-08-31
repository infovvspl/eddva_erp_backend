import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(from?: string, to?: string) {
    const range: any = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return Object.keys(range).length > 0 ? range : undefined;
  }

  async getSummary(from?: string, to?: string) {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const purchaseDateRange = this.dateRange(from, to);

    const [
      totalItems,
      lowStockCountRows,
      stockByLocation,
      todaysIssues,
      overdueReturnsCount,
      assetsByStatus,
      byCategoryIssueRows,
      byVendorPurchases,
      valuationRows,
    ] = await Promise.all([
      this.prisma.invItem.count({ where: { status: 'ACTIVE' } }),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM (
           SELECT i.item_id
           FROM inv_items i
           LEFT JOIN inv_stock_balances b ON b.item_id = i.item_id
           WHERE i.status = 'ACTIVE'
           GROUP BY i.item_id
           HAVING COALESCE(SUM(b.quantity), 0) <= (SELECT reorder_level FROM inv_items WHERE item_id = i.item_id)
         ) low_stock`,
      ),
      this.prisma.invStockBalance.groupBy({ by: ['location_id'], _sum: { quantity: true } }),
      this.prisma.invAssetIssue.count({ where: { issue_date: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.invAssetIssue.count({ where: { expected_return_date: { lt: new Date() }, status: { in: ['issued', 'partially_returned'] } } }),
      this.prisma.invAssetUnit.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.$queryRawUnsafe<Array<{ category: string; issue_count: bigint }>>(
        `SELECT c.name AS category, COUNT(iss.issue_id) AS issue_count
         FROM inv_asset_issues iss
         JOIN inv_items i ON i.item_id = iss.item_id
         JOIN inv_categories c ON c.category_id = i.category_id
         WHERE iss.status IN ('issued','partially_returned','returned')
         GROUP BY c.name
         ORDER BY issue_count DESC`,
      ),
      this.prisma.invStockPurchase.groupBy({
        by: ['vendor_id'],
        where: { purchase_date: purchaseDateRange },
        _sum: { total_amount: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRawUnsafe<Array<{ valuation: number | null }>>(
        `SELECT SUM(b.quantity * COALESCE(latest.unit_price, 0)) AS valuation
         FROM inv_stock_balances b
         LEFT JOIN LATERAL (
           SELECT unit_price FROM inv_stock_purchases p
           WHERE p.item_id = b.item_id
           ORDER BY p.purchase_date DESC, p.purchase_id DESC
           LIMIT 1
         ) latest ON true`,
      ),
    ]);

    const locations = await this.prisma.invLocation.findMany({ where: { location_id: { in: stockByLocation.map((r) => r.location_id) } } });
    const locationMap = new Map(locations.map((l) => [l.location_id, l.name]));

    const vendors = await this.prisma.invVendor.findMany({ where: { vendor_id: { in: byVendorPurchases.map((r) => r.vendor_id) } } });
    const vendorMap = new Map(vendors.map((v) => [v.vendor_id, v.name]));

    const assetStatusMap = Object.fromEntries(assetsByStatus.map((r) => [r.status, r._count._all]));
    const issuedAssets = assetStatusMap.issued ?? 0;
    const idleAssets = (assetStatusMap.in_store ?? 0) + (assetStatusMap.under_repair ?? 0);
    const totalAssets = assetsByStatus.reduce((sum, r) => sum + r._count._all, 0);

    return {
      range: { from: from ?? null, to: to ?? null },
      total_items: totalItems,
      low_stock_items: Number(lowStockCountRows[0]?.count ?? 0),
      stock_by_location: stockByLocation.map((r) => ({ location_id: r.location_id, location: locationMap.get(r.location_id) ?? 'Unknown', quantity: r._sum.quantity ?? 0 })),
      todays_issues: todaysIssues,
      overdue_returns: overdueReturnsCount,
      assets: {
        total: totalAssets,
        issued: issuedAssets,
        idle: idleAssets,
        utilization_pct: totalAssets > 0 ? Number(((issuedAssets / totalAssets) * 100).toFixed(1)) : 0,
        by_status: assetsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      },
      category_wise_consumption: byCategoryIssueRows.map((r) => ({ category: r.category, issue_count: Number(r.issue_count) })),
      vendor_wise_purchases: byVendorPurchases.map((r) => ({
        vendor_id: r.vendor_id,
        vendor: vendorMap.get(r.vendor_id) ?? 'Unknown',
        purchase_count: r._count._all,
        total_amount: Number(r._sum.total_amount ?? 0),
      })),
      stock_valuation: Number(valuationRows[0]?.valuation ?? 0),
    };
  }
}
