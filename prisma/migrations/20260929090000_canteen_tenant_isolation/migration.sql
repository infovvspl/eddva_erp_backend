-- Canteen tenant isolation (step 1 of 2), following the same pattern as the
-- Library, Sports, Inventory and Front Office tenant-isolation migrations.
--
-- Adds a nullable instituteId to every Canteen data table (camelCase, matching this
-- module's existing column naming — unlike the other modules' institute_id), and
-- replaces the globally-unique keys (category name, member barcode, terminal name,
-- order number) with keys that are unique per institute.
--
-- The column is nullable on purpose: existing rows have no institute yet. Until
-- prisma/backfill/canteen-institute-backfill.sql has been reviewed and run, rows
-- with a NULL instituteId are invisible to every school (the API always filters by
-- the caller's institute). A later migration should make the column NOT NULL once
-- the backfill is done.
--
-- Not applied automatically: review, then run `prisma migrate deploy` yourself.

-- DropIndex
DROP INDEX "canteen_menu_categories_name_key";

-- DropIndex
DROP INDEX "canteen_members_idCardBarcode_key";

-- DropIndex
DROP INDEX "canteen_pos_terminals_name_key";

-- DropIndex
DROP INDEX "canteen_orders_orderNumber_key";

-- AlterTable
ALTER TABLE "canteen_menu_categories" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_menu_items" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_menu_schedules" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_members" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_pos_terminals" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_pos_shifts" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_orders" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_order_items" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_payments" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_wallets" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_wallet_topups" ADD COLUMN     "instituteId" TEXT;

-- AlterTable
ALTER TABLE "canteen_wallet_transactions" ADD COLUMN     "instituteId" TEXT;

-- CreateIndex
CREATE INDEX "canteen_menu_categories_instituteId_idx" ON "canteen_menu_categories"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_menu_categories_instituteId_name_key" ON "canteen_menu_categories"("instituteId", "name");

-- CreateIndex
CREATE INDEX "canteen_menu_items_instituteId_idx" ON "canteen_menu_items"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_menu_schedules_instituteId_idx" ON "canteen_menu_schedules"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_members_instituteId_idx" ON "canteen_members"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_members_instituteId_idCardBarcode_key" ON "canteen_members"("instituteId", "idCardBarcode");

-- CreateIndex
CREATE INDEX "canteen_pos_terminals_instituteId_idx" ON "canteen_pos_terminals"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_pos_terminals_instituteId_name_key" ON "canteen_pos_terminals"("instituteId", "name");

-- CreateIndex
CREATE INDEX "canteen_pos_shifts_instituteId_idx" ON "canteen_pos_shifts"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_orders_instituteId_idx" ON "canteen_orders"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_orders_instituteId_orderNumber_key" ON "canteen_orders"("instituteId", "orderNumber");

-- CreateIndex
CREATE INDEX "canteen_order_items_instituteId_idx" ON "canteen_order_items"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_payments_instituteId_idx" ON "canteen_payments"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_wallets_instituteId_idx" ON "canteen_wallets"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_wallet_topups_instituteId_idx" ON "canteen_wallet_topups"("instituteId");

-- CreateIndex
CREATE INDEX "canteen_wallet_transactions_instituteId_idx" ON "canteen_wallet_transactions"("instituteId");

