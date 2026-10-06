-- Inventory institute backfill. REVIEW BEFORE RUNNING; nothing runs this automatically.
--
-- Inventory tables had no institute, so the ERP cannot know which school each existing
-- row belongs to. This script covers the common case: ALL existing Inventory data belongs
-- to ONE institute. If existing rows belong to several schools, do NOT run it as-is; map
-- them yourself before assigning.
--
-- Usage:
--   psql "$DATABASE_URL" -v institute_id="'<institute uuid>'" -f prisma/backfill/inventory-institute-backfill.sql
--
-- Runs in one transaction and prints before/after counts. Roll back by replacing COMMIT with ROLLBACK.

\echo 'Rows without an institute (before):'
SELECT 'inv_categories' AS tbl, count(*) FROM inv_categories WHERE institute_id IS NULL
UNION ALL SELECT 'inv_locations', count(*) FROM inv_locations WHERE institute_id IS NULL
UNION ALL SELECT 'inv_vendors', count(*) FROM inv_vendors WHERE institute_id IS NULL
UNION ALL SELECT 'inv_items', count(*) FROM inv_items WHERE institute_id IS NULL
UNION ALL SELECT 'inv_item_vendors', count(*) FROM inv_item_vendors WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_purchases', count(*) FROM inv_stock_purchases WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_transfers', count(*) FROM inv_stock_transfers WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_adjustments', count(*) FROM inv_stock_adjustments WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_ledger', count(*) FROM inv_stock_ledger WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_balances', count(*) FROM inv_stock_balances WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_units', count(*) FROM inv_asset_units WHERE institute_id IS NULL
UNION ALL SELECT 'inv_holders', count(*) FROM inv_holders WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_issues', count(*) FROM inv_asset_issues WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_returns', count(*) FROM inv_asset_returns WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_maintenance', count(*) FROM inv_asset_maintenance WHERE institute_id IS NULL
UNION ALL SELECT 'inv_approval_rules', count(*) FROM inv_approval_rules WHERE institute_id IS NULL;

BEGIN;

-- Root tables: the single institute given on the command line.
UPDATE inv_categories SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE inv_locations  SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE inv_vendors    SET institute_id = :institute_id WHERE institute_id IS NULL;
UPDATE inv_holders    SET institute_id = :institute_id WHERE institute_id IS NULL;

-- Items inherit from their category.
UPDATE inv_items i SET institute_id = c.institute_id FROM inv_categories c WHERE i.category_id = c.category_id AND i.institute_id IS NULL;

-- Approval rules: category-specific ones inherit from their category; global rules
-- (category_id IS NULL) get the single institute directly, same as the root tables.
UPDATE inv_approval_rules r SET institute_id = c.institute_id FROM inv_categories c WHERE r.category_id = c.category_id AND r.institute_id IS NULL;
UPDATE inv_approval_rules SET institute_id = :institute_id WHERE institute_id IS NULL AND category_id IS NULL;

-- Item-vendor associations, purchases, transfers and adjustments inherit from their item.
UPDATE inv_item_vendors iv SET institute_id = i.institute_id FROM inv_items i WHERE iv.item_id = i.item_id AND iv.institute_id IS NULL;
UPDATE inv_stock_purchases p SET institute_id = i.institute_id FROM inv_items i WHERE p.item_id = i.item_id AND p.institute_id IS NULL;
UPDATE inv_stock_transfers t SET institute_id = i.institute_id FROM inv_items i WHERE t.item_id = i.item_id AND t.institute_id IS NULL;
UPDATE inv_stock_adjustments a SET institute_id = i.institute_id FROM inv_items i WHERE a.item_id = i.item_id AND a.institute_id IS NULL;
UPDATE inv_stock_ledger l SET institute_id = i.institute_id FROM inv_items i WHERE l.item_id = i.item_id AND l.institute_id IS NULL;
UPDATE inv_stock_balances b SET institute_id = i.institute_id FROM inv_items i WHERE b.item_id = i.item_id AND b.institute_id IS NULL;
UPDATE inv_asset_units u SET institute_id = i.institute_id FROM inv_items i WHERE u.item_id = i.item_id AND u.institute_id IS NULL;
UPDATE inv_asset_issues iss SET institute_id = i.institute_id FROM inv_items i WHERE iss.item_id = i.item_id AND iss.institute_id IS NULL;

-- Returns and maintenance inherit from their issue / asset unit.
UPDATE inv_asset_returns r SET institute_id = iss.institute_id FROM inv_asset_issues iss WHERE r.issue_id = iss.issue_id AND r.institute_id IS NULL;
UPDATE inv_asset_maintenance m SET institute_id = u.institute_id FROM inv_asset_units u WHERE m.asset_unit_id = u.asset_unit_id AND m.institute_id IS NULL;

-- Safety check: a child that belongs to a different institute than its parent means the
-- data was mixed. Abort instead of committing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM inv_items i JOIN inv_categories c ON c.category_id = i.category_id
    WHERE i.institute_id IS DISTINCT FROM c.institute_id
  ) THEN
    RAISE EXCEPTION 'Items and their categories belong to different institutes; aborting';
  END IF;
END $$;

COMMIT;

\echo 'Rows still without an institute (after; expect all zero):'
SELECT 'inv_categories' AS tbl, count(*) FROM inv_categories WHERE institute_id IS NULL
UNION ALL SELECT 'inv_locations', count(*) FROM inv_locations WHERE institute_id IS NULL
UNION ALL SELECT 'inv_vendors', count(*) FROM inv_vendors WHERE institute_id IS NULL
UNION ALL SELECT 'inv_items', count(*) FROM inv_items WHERE institute_id IS NULL
UNION ALL SELECT 'inv_item_vendors', count(*) FROM inv_item_vendors WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_purchases', count(*) FROM inv_stock_purchases WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_transfers', count(*) FROM inv_stock_transfers WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_adjustments', count(*) FROM inv_stock_adjustments WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_ledger', count(*) FROM inv_stock_ledger WHERE institute_id IS NULL
UNION ALL SELECT 'inv_stock_balances', count(*) FROM inv_stock_balances WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_units', count(*) FROM inv_asset_units WHERE institute_id IS NULL
UNION ALL SELECT 'inv_holders', count(*) FROM inv_holders WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_issues', count(*) FROM inv_asset_issues WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_returns', count(*) FROM inv_asset_returns WHERE institute_id IS NULL
UNION ALL SELECT 'inv_asset_maintenance', count(*) FROM inv_asset_maintenance WHERE institute_id IS NULL
UNION ALL SELECT 'inv_approval_rules', count(*) FROM inv_approval_rules WHERE institute_id IS NULL;
