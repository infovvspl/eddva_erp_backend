-- Canteen, Library, Sports, Front Office, Inventory, Accounts, and Sales &
-- Purchase were storing the raw signed session JWT at rest (canteen_token,
-- lib_token, sports_token, fo_token, inv_token, acc_token, sp_token) instead
-- of a SHA-256 hash like Hostel/Staff/Admission/Alumni's *SsoSession tables
-- (token_hash). Existing sessions are just 24h-TTL tokens, not durable data,
-- so they're dropped rather than migrated — anyone with a live session
-- simply re-exchanges on their next request to that module.

ALTER TABLE "canteen_sso_sessions" DROP CONSTRAINT IF EXISTS "canteen_sso_sessions_canteen_token_key";
ALTER TABLE "canteen_sso_sessions" DROP COLUMN "canteen_token";
ALTER TABLE "canteen_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "canteen_sso_sessions";
ALTER TABLE "canteen_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "canteen_sso_sessions_token_hash_key" ON "canteen_sso_sessions"("token_hash");

ALTER TABLE "library_sso_sessions" DROP CONSTRAINT IF EXISTS "library_sso_sessions_lib_token_key";
ALTER TABLE "library_sso_sessions" DROP COLUMN "lib_token";
ALTER TABLE "library_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "library_sso_sessions";
ALTER TABLE "library_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "library_sso_sessions_token_hash_key" ON "library_sso_sessions"("token_hash");

ALTER TABLE "sports_sso_sessions" DROP CONSTRAINT IF EXISTS "sports_sso_sessions_sports_token_key";
ALTER TABLE "sports_sso_sessions" DROP COLUMN "sports_token";
ALTER TABLE "sports_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "sports_sso_sessions";
ALTER TABLE "sports_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "sports_sso_sessions_token_hash_key" ON "sports_sso_sessions"("token_hash");

ALTER TABLE "front_office_sso_sessions" DROP CONSTRAINT IF EXISTS "front_office_sso_sessions_fo_token_key";
ALTER TABLE "front_office_sso_sessions" DROP COLUMN "fo_token";
ALTER TABLE "front_office_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "front_office_sso_sessions";
ALTER TABLE "front_office_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "front_office_sso_sessions_token_hash_key" ON "front_office_sso_sessions"("token_hash");

ALTER TABLE "inventory_sso_sessions" DROP CONSTRAINT IF EXISTS "inventory_sso_sessions_inv_token_key";
ALTER TABLE "inventory_sso_sessions" DROP COLUMN "inv_token";
ALTER TABLE "inventory_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "inventory_sso_sessions";
ALTER TABLE "inventory_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "inventory_sso_sessions_token_hash_key" ON "inventory_sso_sessions"("token_hash");

ALTER TABLE "accounts_sso_sessions" DROP CONSTRAINT IF EXISTS "accounts_sso_sessions_acc_token_key";
ALTER TABLE "accounts_sso_sessions" DROP COLUMN "acc_token";
ALTER TABLE "accounts_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "accounts_sso_sessions";
ALTER TABLE "accounts_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "accounts_sso_sessions_token_hash_key" ON "accounts_sso_sessions"("token_hash");

ALTER TABLE "sales_purchase_sso_sessions" DROP CONSTRAINT IF EXISTS "sales_purchase_sso_sessions_sp_token_key";
ALTER TABLE "sales_purchase_sso_sessions" DROP COLUMN "sp_token";
ALTER TABLE "sales_purchase_sso_sessions" ADD COLUMN "token_hash" TEXT;
DELETE FROM "sales_purchase_sso_sessions";
ALTER TABLE "sales_purchase_sso_sessions" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "sales_purchase_sso_sessions_token_hash_key" ON "sales_purchase_sso_sessions"("token_hash");
