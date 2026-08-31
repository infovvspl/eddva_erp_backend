import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Items whose total stock across all locations is at/below their reorder_level, with a per-location breakdown. */
  async lowStock() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ item_id: number; total_qty: bigint | null }>>(
      `SELECT i.item_id, COALESCE(SUM(b.quantity), 0) AS total_qty
       FROM inv_items i
       LEFT JOIN inv_stock_balances b ON b.item_id = i.item_id
       WHERE i.status = 'ACTIVE'
       GROUP BY i.item_id
       HAVING COALESCE(SUM(b.quantity), 0) <= (SELECT reorder_level FROM inv_items WHERE item_id = i.item_id)`,
    );

    const itemIds = rows.map((r) => r.item_id);
    if (itemIds.length === 0) return [];

    const items = await this.prisma.invItem.findMany({
      where: { item_id: { in: itemIds } },
      include: {
        category: { select: { name: true } },
        balances: { include: { location: { select: { location_id: true, name: true } } } },
      },
    });

    const totalByItem = new Map(rows.map((r) => [r.item_id, Number(r.total_qty ?? 0)]));
    return items.map((item) => ({
      item_id: item.item_id,
      item_code: item.item_code,
      name: item.name,
      category: item.category.name,
      unit_of_measure: item.unit_of_measure,
      reorder_level: item.reorder_level,
      total_stock: totalByItem.get(item.item_id) ?? 0,
      by_location: item.balances.map((b) => ({ location_id: b.location_id, location: b.location.name, quantity: b.quantity })),
    }));
  }

  /** Active issues whose expected_return_date has passed without being fully returned. */
  async overdueReturns() {
    const now = new Date();
    return this.prisma.invAssetIssue.findMany({
      where: {
        expected_return_date: { lt: now },
        status: { in: ['issued', 'partially_returned'] },
      },
      include: {
        item: { select: { item_id: true, name: true, item_code: true, item_type: true } },
        asset_unit: { select: { asset_unit_id: true, asset_tag: true } },
        holder: { select: { holder_id: true, name: true, holder_type: true } },
        source_location: { select: { location_id: true, name: true } },
      },
      orderBy: { expected_return_date: 'asc' },
    });
  }
}
