-- Canteen institute backfill. REVIEW BEFORE RUNNING; nothing runs this automatically.
--
-- Canteen tables had no institute, so the ERP cannot know which school each existing
-- row belongs to. This script covers the common case: ALL existing Canteen data
-- belongs to ONE institute. If existing rows belong to several schools, do NOT run
-- it as-is; map them yourself before assigning.
--
-- Usage:
--   psql "$DATABASE_URL" -v institute_id="'<institute uuid>'" -f prisma/backfill/canteen-institute-backfill.sql
--
-- Runs in one transaction and prints before/after counts. Roll back by replacing COMMIT with ROLLBACK.
-- Column names here are camelCase ("instituteId"), matching this module's existing convention
-- — unlike the snake_case institute_id used by the other modules' backfill scripts.

\echo 'Rows without an institute (before):'
SELECT 'canteen_menu_categories' AS tbl, count(*) FROM canteen_menu_categories WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_menu_items', count(*) FROM canteen_menu_items WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_menu_schedules', count(*) FROM canteen_menu_schedules WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_members', count(*) FROM canteen_members WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_pos_terminals', count(*) FROM canteen_pos_terminals WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_pos_shifts', count(*) FROM canteen_pos_shifts WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_orders', count(*) FROM canteen_orders WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_order_items', count(*) FROM canteen_order_items WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_payments', count(*) FROM canteen_payments WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_wallets', count(*) FROM canteen_wallets WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_wallet_topups', count(*) FROM canteen_wallet_topups WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_wallet_transactions', count(*) FROM canteen_wallet_transactions WHERE "instituteId" IS NULL;

BEGIN;

-- Root tables: the single institute given on the command line.
UPDATE canteen_menu_categories SET "instituteId" = :institute_id WHERE "instituteId" IS NULL;
UPDATE canteen_members         SET "instituteId" = :institute_id WHERE "instituteId" IS NULL;
UPDATE canteen_pos_terminals   SET "instituteId" = :institute_id WHERE "instituteId" IS NULL;

-- Menu items inherit from their category; schedules from their item.
UPDATE canteen_menu_items mi SET "instituteId" = c."instituteId" FROM canteen_menu_categories c WHERE mi."categoryId" = c.id AND mi."instituteId" IS NULL;
UPDATE canteen_menu_schedules ms SET "instituteId" = mi."instituteId" FROM canteen_menu_items mi WHERE ms."itemId" = mi.id AND ms."instituteId" IS NULL;

-- POS shifts inherit from their terminal.
UPDATE canteen_pos_shifts s SET "instituteId" = t."instituteId" FROM canteen_pos_terminals t WHERE s."terminalId" = t.id AND s."instituteId" IS NULL;

-- Wallets inherit from their member; topups and ledger transactions from their wallet.
UPDATE canteen_wallets w SET "instituteId" = m."instituteId" FROM canteen_members m WHERE w."memberId" = m.id AND w."instituteId" IS NULL;
UPDATE canteen_wallet_topups t SET "instituteId" = w."instituteId" FROM canteen_wallets w WHERE t."walletId" = w.id AND t."instituteId" IS NULL;
UPDATE canteen_wallet_transactions tx SET "instituteId" = w."instituteId" FROM canteen_wallets w WHERE tx."walletId" = w.id AND tx."instituteId" IS NULL;

-- Orders: member and terminal are both optional (a walk-in sale may have neither), so an
-- order inherits from whichever of the two it has, and otherwise falls back to the single
-- institute given on the command line.
UPDATE canteen_orders o SET "instituteId" = m."instituteId" FROM canteen_members m WHERE o."memberId" = m.id AND o."instituteId" IS NULL;
UPDATE canteen_orders o SET "instituteId" = t."instituteId" FROM canteen_pos_terminals t WHERE o."terminalId" = t.id AND o."instituteId" IS NULL;
UPDATE canteen_orders SET "instituteId" = :institute_id WHERE "instituteId" IS NULL;

-- Order items and payments inherit from their order.
UPDATE canteen_order_items oi SET "instituteId" = o."instituteId" FROM canteen_orders o WHERE oi."orderId" = o.id AND oi."instituteId" IS NULL;
UPDATE canteen_payments p SET "instituteId" = o."instituteId" FROM canteen_orders o WHERE p."orderId" = o.id AND p."instituteId" IS NULL;

-- Safety check: a child that belongs to a different institute than its parent means the
-- data was mixed. Abort instead of committing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM canteen_menu_items mi JOIN canteen_menu_categories c ON c.id = mi."categoryId"
    WHERE mi."instituteId" IS DISTINCT FROM c."instituteId"
  ) THEN
    RAISE EXCEPTION 'Menu items and their categories belong to different institutes; aborting';
  END IF;
END $$;

COMMIT;

\echo 'Rows still without an institute (after; expect all zero):'
SELECT 'canteen_menu_categories' AS tbl, count(*) FROM canteen_menu_categories WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_menu_items', count(*) FROM canteen_menu_items WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_menu_schedules', count(*) FROM canteen_menu_schedules WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_members', count(*) FROM canteen_members WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_pos_terminals', count(*) FROM canteen_pos_terminals WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_pos_shifts', count(*) FROM canteen_pos_shifts WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_orders', count(*) FROM canteen_orders WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_order_items', count(*) FROM canteen_order_items WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_payments', count(*) FROM canteen_payments WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_wallets', count(*) FROM canteen_wallets WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_wallet_topups', count(*) FROM canteen_wallet_topups WHERE "instituteId" IS NULL
UNION ALL SELECT 'canteen_wallet_transactions', count(*) FROM canteen_wallet_transactions WHERE "instituteId" IS NULL;
