import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StockBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalances(params: { item_id?: number; location_id?: number; page?: number; limit?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 50;

    const where: any = {};
    if (params.item_id) where.item_id = params.item_id;
    if (params.location_id) where.location_id = params.location_id;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invStockBalance.findMany({
        where,
        include: {
          item: { select: { item_id: true, name: true, item_code: true, reorder_level: true, unit_of_measure: true } },
          location: { select: { location_id: true, name: true } },
        },
        orderBy: [{ item_id: 'asc' }, { location_id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invStockBalance.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getLedger(params: {
    item_id?: number;
    location_id?: number;
    transaction_type?: string;
    reference_type?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 50;

    const where: any = {};
    if (params.item_id) where.item_id = params.item_id;
    if (params.location_id) where.location_id = params.location_id;
    if (params.transaction_type) where.transaction_type = params.transaction_type;
    if (params.reference_type) where.reference_type = params.reference_type;
    if (params.date_from || params.date_to) {
      where.created_at = {};
      if (params.date_from) where.created_at.gte = new Date(params.date_from);
      if (params.date_to) where.created_at.lte = new Date(params.date_to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invStockLedger.findMany({
        where,
        include: {
          item: { select: { item_id: true, name: true, item_code: true } },
          location: { select: { location_id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invStockLedger.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Recalculates stock_balances purely from stock_ledger — the ledger is
   * authoritative, so if a balance row ever drifted (it shouldn't, given
   * every write goes through InventoryStockLedgerService's atomic upserts),
   * this rebuilds the cache to match it exactly.
   */
  async reconcile(itemId?: number) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ item_id: number; location_id: number; balance: bigint }>>(
      `SELECT item_id, location_id, SUM(
         CASE
           WHEN transaction_type IN ('purchase_in','transfer_in','return_in','adjustment_in') THEN quantity
           WHEN transaction_type IN ('transfer_out','issue_out','adjustment_out') THEN -quantity
           ELSE 0
         END
       ) AS balance
       FROM inv_stock_ledger
       ${itemId ? 'WHERE item_id = $1' : ''}
       GROUP BY item_id, location_id`,
      ...(itemId ? [itemId] : []),
    );

    const results: Array<{ item_id: number; location_id: number; quantity: number; updated_at: Date }> = [];
    for (const row of rows) {
      const quantity = Number(row.balance);
      const updated = await this.prisma.invStockBalance.upsert({
        where: { item_id_location_id: { item_id: row.item_id, location_id: row.location_id } },
        update: { quantity },
        create: { item_id: row.item_id, location_id: row.location_id, quantity },
      });
      results.push(updated);
    }

    return { reconciled_rows: results.length, balances: results };
  }
}
