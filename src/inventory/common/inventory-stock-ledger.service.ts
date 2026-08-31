import { ConflictException, Injectable } from '@nestjs/common';
import { InvReferenceType, InvStockTxnType, Prisma } from '@prisma/client';

export interface StockMovementParams {
  item_id: number;
  location_id: number;
  quantity: number; // always a positive magnitude — direction comes from transaction_type
  reference_type: InvReferenceType;
  reference_id: number;
  purchase_id?: number;
  transfer_id?: number;
  adjustment_id?: number;
  issue_id?: number;
  return_id?: number;
  created_by?: string;
}

type TxClient = Prisma.TransactionClient;

/**
 * InventoryStockLedgerService — the single choke point every stock-affecting
 * operation (purchase/transfer/adjustment/issue/return) goes through.
 *
 * `stock_ledger` is the source of truth; `stock_balances` is a derived cache
 * kept in sync with it atomically. Every write here uses a single SQL
 * statement (INSERT..ON CONFLICT..RETURNING for increments, a conditional
 * UPDATE..WHERE quantity >= n..RETURNING for decrements) — the same atomic
 * upsert pattern already used for document numbering in
 * numbering.service.ts. This makes concurrent stock operations race-safe
 * without needing advisory locks: two simultaneous decrements against the
 * same (item_id, location_id) row serialize at the database's row-level
 * lock implicit in the UPDATE, and only one can satisfy `quantity >= n` if
 * that was the last unit.
 *
 * Ledger rows are never updated or deleted after creation (append-only) —
 * corrections happen through new adjustment transactions.
 */
@Injectable()
export class InventoryStockLedgerService {
  /** Increases stock — purchase_in, transfer_in, return_in, adjustment_in. */
  async increment(tx: TxClient, transactionType: InvStockTxnType, params: StockMovementParams): Promise<number> {
    if (params.quantity <= 0) {
      throw new ConflictException('Movement quantity must be positive');
    }

    const rows = await tx.$queryRawUnsafe<Array<{ quantity: number }>>(
      `INSERT INTO inv_stock_balances (item_id, location_id, quantity, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (item_id, location_id)
       DO UPDATE SET quantity = inv_stock_balances.quantity + $3, updated_at = NOW()
       RETURNING quantity`,
      params.item_id,
      params.location_id,
      params.quantity,
    );

    const balance_after = rows[0].quantity;
    await this.writeLedger(tx, transactionType, balance_after, params);
    return balance_after;
  }

  /**
   * Decreases stock — transfer_out, issue_out, adjustment_out. Atomically
   * rejects the movement (no balance change, no ledger row) if it would take
   * stock negative — including the case where no balance row exists yet
   * (implicitly zero stock).
   */
  async decrement(tx: TxClient, transactionType: InvStockTxnType, params: StockMovementParams): Promise<number> {
    if (params.quantity <= 0) {
      throw new ConflictException('Movement quantity must be positive');
    }

    const rows = await tx.$queryRawUnsafe<Array<{ quantity: number }>>(
      `UPDATE inv_stock_balances
       SET quantity = quantity - $3, updated_at = NOW()
       WHERE item_id = $1 AND location_id = $2 AND quantity >= $3
       RETURNING quantity`,
      params.item_id,
      params.location_id,
      params.quantity,
    );

    if (rows.length === 0) {
      throw new ConflictException(
        `Insufficient stock for item #${params.item_id} at location #${params.location_id} (requested ${params.quantity})`,
      );
    }

    const balance_after = rows[0].quantity;
    await this.writeLedger(tx, transactionType, balance_after, params);
    return balance_after;
  }

  private async writeLedger(tx: TxClient, transactionType: InvStockTxnType, balance_after: number, params: StockMovementParams) {
    await tx.invStockLedger.create({
      data: {
        item_id: params.item_id,
        location_id: params.location_id,
        transaction_type: transactionType,
        quantity: params.quantity,
        balance_after,
        reference_type: params.reference_type,
        reference_id: params.reference_id,
        purchase_id: params.purchase_id,
        transfer_id: params.transfer_id,
        adjustment_id: params.adjustment_id,
        issue_id: params.issue_id,
        return_id: params.return_id,
        created_by: params.created_by,
      },
    });
  }
}
