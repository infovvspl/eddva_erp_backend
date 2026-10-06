-- Inventory tenant isolation (step 1 of 2), following the same pattern as
-- 20260925090000_library_tenant_isolation and 20260928080000_sports_tenant_isolation.
--
-- Adds a nullable institute_id to every Inventory data table, and replaces the
-- globally-unique keys (category name, location name, item code, asset tag) with
-- keys that are unique per institute.
--
-- The column is nullable on purpose: existing rows have no institute yet. Until
-- prisma/backfill/inventory-institute-backfill.sql has been reviewed and run, rows
-- with a NULL institute_id are invisible to every school (the API always filters by
-- the caller's institute). A later migration should make the column NOT NULL once
-- the backfill is done.
--
-- Not applied automatically: review, then run `prisma migrate deploy` yourself.

-- DropIndex
DROP INDEX "inv_categories_name_key";

-- DropIndex
DROP INDEX "inv_locations_name_key";

-- DropIndex
DROP INDEX "inv_items_item_code_key";

-- DropIndex
DROP INDEX "inv_asset_units_asset_tag_key";

-- AlterTable
ALTER TABLE "inv_categories" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_locations" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_vendors" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_items" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_item_vendors" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_stock_purchases" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_stock_transfers" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_stock_adjustments" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_stock_ledger" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_stock_balances" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_asset_units" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_holders" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_asset_issues" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_asset_returns" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_asset_maintenance" ADD COLUMN     "institute_id" TEXT;

-- AlterTable
ALTER TABLE "inv_approval_rules" ADD COLUMN     "institute_id" TEXT;

-- CreateIndex
CREATE INDEX "inv_categories_institute_id_idx" ON "inv_categories"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_categories_institute_id_name_key" ON "inv_categories"("institute_id", "name");

-- CreateIndex
CREATE INDEX "inv_locations_institute_id_idx" ON "inv_locations"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_locations_institute_id_name_key" ON "inv_locations"("institute_id", "name");

-- CreateIndex
CREATE INDEX "inv_vendors_institute_id_idx" ON "inv_vendors"("institute_id");

-- CreateIndex
CREATE INDEX "inv_items_institute_id_idx" ON "inv_items"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_items_institute_id_item_code_key" ON "inv_items"("institute_id", "item_code");

-- CreateIndex
CREATE INDEX "inv_item_vendors_institute_id_idx" ON "inv_item_vendors"("institute_id");

-- CreateIndex
CREATE INDEX "inv_stock_purchases_institute_id_idx" ON "inv_stock_purchases"("institute_id");

-- CreateIndex
CREATE INDEX "inv_stock_transfers_institute_id_idx" ON "inv_stock_transfers"("institute_id");

-- CreateIndex
CREATE INDEX "inv_stock_adjustments_institute_id_idx" ON "inv_stock_adjustments"("institute_id");

-- CreateIndex
CREATE INDEX "inv_stock_ledger_institute_id_idx" ON "inv_stock_ledger"("institute_id");

-- CreateIndex
CREATE INDEX "inv_stock_balances_institute_id_idx" ON "inv_stock_balances"("institute_id");

-- CreateIndex
CREATE INDEX "inv_asset_units_institute_id_idx" ON "inv_asset_units"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_asset_units_institute_id_asset_tag_key" ON "inv_asset_units"("institute_id", "asset_tag");

-- CreateIndex
CREATE INDEX "inv_holders_institute_id_idx" ON "inv_holders"("institute_id");

-- CreateIndex
CREATE INDEX "inv_asset_issues_institute_id_idx" ON "inv_asset_issues"("institute_id");

-- CreateIndex
CREATE INDEX "inv_asset_returns_institute_id_idx" ON "inv_asset_returns"("institute_id");

-- CreateIndex
CREATE INDEX "inv_asset_maintenance_institute_id_idx" ON "inv_asset_maintenance"("institute_id");

-- CreateIndex
CREATE INDEX "inv_approval_rules_institute_id_idx" ON "inv_approval_rules"("institute_id");

