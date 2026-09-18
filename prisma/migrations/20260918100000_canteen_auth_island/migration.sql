-- Give Canteen its own auth island, decoupled from the core users table.
-- CanteenUserRole.userId is a live identity (used to resolve permissions at
-- request time) so it gets a real FK to the new canteen_users table.
-- The other 4 (canteen_orders.createdBy, canteen_pos_shifts.staffId,
-- canteen_payments.receivedBy, canteen_wallet_topups.approvedBy) are
-- historical actor-attribution fields, same as Accounts' vouchers.createdBy
-- precedent, and become plain unconstrained strings; their existing values
-- (core User ids) remain valid as opaque historical strings.

-- DropForeignKey
ALTER TABLE "canteen_orders" DROP CONSTRAINT "canteen_orders_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "canteen_payments" DROP CONSTRAINT "canteen_payments_receivedBy_fkey";

-- DropForeignKey
ALTER TABLE "canteen_pos_shifts" DROP CONSTRAINT "canteen_pos_shifts_staffId_fkey";

-- DropForeignKey
ALTER TABLE "canteen_user_roles" DROP CONSTRAINT "canteen_user_roles_userId_fkey";

-- DropForeignKey
ALTER TABLE "canteen_wallet_topups" DROP CONSTRAINT "canteen_wallet_topups_approvedBy_fkey";

-- CreateTable
CREATE TABLE "canteen_users" (
    "id" TEXT NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "canteen_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canteen_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canteen_users_institute_id_username_key" ON "canteen_users"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_sso_sessions_canteen_token_key" ON "canteen_sso_sessions"("canteen_token");

-- Data migration: the sole existing canteen_user_roles row (assigned to test
-- account "yo", CANTEEN_COUNTER_STAFF) is repointed from its old core-User id
-- to a freshly created canteen_users row carrying the same identity, so the
-- new FK constraint below has a valid target. Password is freshly issued
-- (Canteen@123) since the old core password hash can't be migrated/reused.
INSERT INTO "canteen_users" ("id", "institute_id", "name", "email", "username", "password_hash", "is_active", "created_at", "updated_at")
VALUES ('62ede629-88f0-492e-b952-61e06022b863', 'INST_DEMO_101', 'yo', 'yo@yo.in', 'yo', '$2b$10$3QXwHf/V7A3eTbe0bTIbw.wITgwQleWuDJBRVXUndmsvPdHtUYbcm', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "canteen_user_roles" SET "userId" = '62ede629-88f0-492e-b952-61e06022b863' WHERE "userId" = '8bd8c7f3-519f-407c-a7e7-07a05ecadf37';

-- AddForeignKey
ALTER TABLE "canteen_user_roles" ADD CONSTRAINT "canteen_user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "canteen_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
