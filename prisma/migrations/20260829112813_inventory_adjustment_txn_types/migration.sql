-- Split the generic 'adjustment' stock-ledger transaction type into
-- 'adjustment_in' / 'adjustment_out' so direction is always encoded by
-- transaction_type, consistent with purchase_in/transfer_in/transfer_out/
-- issue_out/return_in. Table is empty (module just created), so this is a
-- safe rebuild with no data migration needed.

ALTER TYPE "InvStockTxnType" RENAME TO "InvStockTxnType_old";

CREATE TYPE "InvStockTxnType" AS ENUM ('purchase_in', 'transfer_out', 'transfer_in', 'adjustment_in', 'adjustment_out', 'issue_out', 'return_in');

ALTER TABLE "inv_stock_ledger" ALTER COLUMN "transaction_type" TYPE "InvStockTxnType" USING ("transaction_type"::text::"InvStockTxnType");

DROP TYPE "InvStockTxnType_old";
