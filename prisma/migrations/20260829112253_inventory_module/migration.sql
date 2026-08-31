-- CreateEnum
CREATE TYPE "InvLocationType" AS ENUM ('store', 'department', 'classroom', 'lab');

-- CreateEnum
CREATE TYPE "InvItemType" AS ENUM ('consumable', 'asset');

-- CreateEnum
CREATE TYPE "InvAdjustmentReason" AS ENUM ('damaged', 'expired', 'lost', 'audit_correction');

-- CreateEnum
CREATE TYPE "InvStockTxnType" AS ENUM ('purchase_in', 'transfer_out', 'transfer_in', 'adjustment', 'issue_out', 'return_in');

-- CreateEnum
CREATE TYPE "InvReferenceType" AS ENUM ('purchase', 'transfer', 'adjustment', 'issue', 'return');

-- CreateEnum
CREATE TYPE "InvAssetStatus" AS ENUM ('in_store', 'issued', 'under_repair', 'disposed', 'lost');

-- CreateEnum
CREATE TYPE "InvHolderType" AS ENUM ('staff', 'student', 'department');

-- CreateEnum
CREATE TYPE "InvIssueStatus" AS ENUM ('pending_approval', 'issued', 'partially_returned', 'returned', 'overdue', 'rejected');

-- CreateEnum
CREATE TYPE "InvApprovalStatus" AS ENUM ('not_required', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "InvReturnCondition" AS ENUM ('good', 'damaged', 'unusable');

-- CreateEnum
CREATE TYPE "InvMaintenanceStatus" AS ENUM ('reported', 'in_progress', 'resolved');

-- CreateTable
CREATE TABLE "inv_categories" (
    "category_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "inv_locations" (
    "location_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InvLocationType" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_locations_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "inv_vendors" (
    "vendor_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_vendors_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "inv_items" (
    "item_id" SERIAL NOT NULL,
    "item_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "item_type" "InvItemType" NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "image_url" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "inv_item_vendors" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "last_purchase_price" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_item_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_purchases" (
    "purchase_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "invoice_number" TEXT,
    "purchase_date" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_stock_purchases_pkey" PRIMARY KEY ("purchase_id")
);

-- CreateTable
CREATE TABLE "inv_stock_transfers" (
    "transfer_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "from_location_id" INTEGER NOT NULL,
    "to_location_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "transfer_date" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_stock_transfers_pkey" PRIMARY KEY ("transfer_id")
);

-- CreateTable
CREATE TABLE "inv_stock_adjustments" (
    "adjustment_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" "InvAdjustmentReason" NOT NULL,
    "remarks" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_stock_adjustments_pkey" PRIMARY KEY ("adjustment_id")
);

-- CreateTable
CREATE TABLE "inv_stock_ledger" (
    "ledger_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "transaction_type" "InvStockTxnType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reference_type" "InvReferenceType" NOT NULL,
    "reference_id" INTEGER NOT NULL,
    "purchase_id" INTEGER,
    "transfer_id" INTEGER,
    "adjustment_id" INTEGER,
    "issue_id" INTEGER,
    "return_id" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_stock_ledger_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "inv_stock_balances" (
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_stock_balances_pkey" PRIMARY KEY ("item_id","location_id")
);

-- CreateTable
CREATE TABLE "inv_asset_units" (
    "asset_unit_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "serial_number" TEXT,
    "purchase_id" INTEGER,
    "current_location_id" INTEGER,
    "current_holder_id" INTEGER,
    "status" "InvAssetStatus" NOT NULL DEFAULT 'in_store',
    "purchase_date" DATE,
    "warranty_expiry" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_asset_units_pkey" PRIMARY KEY ("asset_unit_id")
);

-- CreateTable
CREATE TABLE "inv_holders" (
    "holder_id" SERIAL NOT NULL,
    "holder_type" "InvHolderType" NOT NULL,
    "name" TEXT NOT NULL,
    "external_ref_id" TEXT,
    "contact_phone" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_holders_pkey" PRIMARY KEY ("holder_id")
);

-- CreateTable
CREATE TABLE "inv_asset_issues" (
    "issue_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "asset_unit_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "quantity_returned" INTEGER NOT NULL DEFAULT 0,
    "holder_id" INTEGER NOT NULL,
    "source_location_id" INTEGER NOT NULL,
    "issue_date" DATE NOT NULL,
    "expected_return_date" DATE,
    "status" "InvIssueStatus" NOT NULL DEFAULT 'issued',
    "approval_status" "InvApprovalStatus" NOT NULL DEFAULT 'not_required',
    "approval_rule_id" INTEGER,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "issued_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_asset_issues_pkey" PRIMARY KEY ("issue_id")
);

-- CreateTable
CREATE TABLE "inv_asset_returns" (
    "return_id" SERIAL NOT NULL,
    "issue_id" INTEGER NOT NULL,
    "quantity_returned" INTEGER NOT NULL,
    "condition" "InvReturnCondition" NOT NULL,
    "remarks" TEXT,
    "return_date" DATE NOT NULL,
    "received_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_asset_returns_pkey" PRIMARY KEY ("return_id")
);

-- CreateTable
CREATE TABLE "inv_asset_maintenance" (
    "maintenance_id" SERIAL NOT NULL,
    "asset_unit_id" INTEGER NOT NULL,
    "issue_reported" TEXT NOT NULL,
    "service_date" DATE,
    "cost" DECIMAL(12,2),
    "status" "InvMaintenanceStatus" NOT NULL DEFAULT 'reported',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_asset_maintenance_pkey" PRIMARY KEY ("maintenance_id")
);

-- CreateTable
CREATE TABLE "inv_approval_rules" (
    "rule_id" SERIAL NOT NULL,
    "category_id" INTEGER,
    "value_threshold" DECIMAL(14,2),
    "quantity_threshold" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_approval_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "inventory_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "inventory_user_dynamic_roles" (
    "id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "inv_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "inventory_permissions_catalog" (
    "permission_id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inv_categories_name_key" ON "inv_categories"("name");

-- CreateIndex
CREATE INDEX "inv_categories_parent_category_id_idx" ON "inv_categories"("parent_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_locations_name_key" ON "inv_locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inv_items_item_code_key" ON "inv_items"("item_code");

-- CreateIndex
CREATE INDEX "inv_items_category_id_idx" ON "inv_items"("category_id");

-- CreateIndex
CREATE INDEX "inv_items_item_type_idx" ON "inv_items"("item_type");

-- CreateIndex
CREATE INDEX "inv_items_name_idx" ON "inv_items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inv_item_vendors_item_id_vendor_id_key" ON "inv_item_vendors"("item_id", "vendor_id");

-- CreateIndex
CREATE INDEX "inv_stock_purchases_vendor_id_idx" ON "inv_stock_purchases"("vendor_id");

-- CreateIndex
CREATE INDEX "inv_stock_purchases_item_id_idx" ON "inv_stock_purchases"("item_id");

-- CreateIndex
CREATE INDEX "inv_stock_purchases_location_id_idx" ON "inv_stock_purchases"("location_id");

-- CreateIndex
CREATE INDEX "inv_stock_purchases_purchase_date_idx" ON "inv_stock_purchases"("purchase_date");

-- CreateIndex
CREATE INDEX "inv_stock_transfers_item_id_idx" ON "inv_stock_transfers"("item_id");

-- CreateIndex
CREATE INDEX "inv_stock_transfers_from_location_id_idx" ON "inv_stock_transfers"("from_location_id");

-- CreateIndex
CREATE INDEX "inv_stock_transfers_to_location_id_idx" ON "inv_stock_transfers"("to_location_id");

-- CreateIndex
CREATE INDEX "inv_stock_transfers_transfer_date_idx" ON "inv_stock_transfers"("transfer_date");

-- CreateIndex
CREATE INDEX "inv_stock_adjustments_item_id_idx" ON "inv_stock_adjustments"("item_id");

-- CreateIndex
CREATE INDEX "inv_stock_adjustments_location_id_idx" ON "inv_stock_adjustments"("location_id");

-- CreateIndex
CREATE INDEX "inv_stock_adjustments_reason_idx" ON "inv_stock_adjustments"("reason");

-- CreateIndex
CREATE INDEX "inv_stock_adjustments_created_at_idx" ON "inv_stock_adjustments"("created_at");

-- CreateIndex
CREATE INDEX "inv_stock_ledger_item_id_location_id_idx" ON "inv_stock_ledger"("item_id", "location_id");

-- CreateIndex
CREATE INDEX "inv_stock_ledger_transaction_type_idx" ON "inv_stock_ledger"("transaction_type");

-- CreateIndex
CREATE INDEX "inv_stock_ledger_reference_type_reference_id_idx" ON "inv_stock_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "inv_stock_ledger_created_at_idx" ON "inv_stock_ledger"("created_at");

-- CreateIndex
CREATE INDEX "inv_stock_balances_location_id_idx" ON "inv_stock_balances"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inv_asset_units_asset_tag_key" ON "inv_asset_units"("asset_tag");

-- CreateIndex
CREATE INDEX "inv_asset_units_status_idx" ON "inv_asset_units"("status");

-- CreateIndex
CREATE INDEX "inv_asset_units_current_holder_id_idx" ON "inv_asset_units"("current_holder_id");

-- CreateIndex
CREATE INDEX "inv_asset_units_item_id_idx" ON "inv_asset_units"("item_id");

-- CreateIndex
CREATE INDEX "inv_holders_holder_type_idx" ON "inv_holders"("holder_type");

-- CreateIndex
CREATE INDEX "inv_asset_issues_holder_id_idx" ON "inv_asset_issues"("holder_id");

-- CreateIndex
CREATE INDEX "inv_asset_issues_item_id_idx" ON "inv_asset_issues"("item_id");

-- CreateIndex
CREATE INDEX "inv_asset_issues_asset_unit_id_idx" ON "inv_asset_issues"("asset_unit_id");

-- CreateIndex
CREATE INDEX "inv_asset_issues_status_idx" ON "inv_asset_issues"("status");

-- CreateIndex
CREATE INDEX "inv_asset_issues_approval_status_idx" ON "inv_asset_issues"("approval_status");

-- CreateIndex
CREATE INDEX "inv_asset_issues_expected_return_date_idx" ON "inv_asset_issues"("expected_return_date");

-- CreateIndex
CREATE INDEX "inv_asset_returns_issue_id_idx" ON "inv_asset_returns"("issue_id");

-- CreateIndex
CREATE INDEX "inv_asset_maintenance_asset_unit_id_idx" ON "inv_asset_maintenance"("asset_unit_id");

-- CreateIndex
CREATE INDEX "inv_asset_maintenance_status_idx" ON "inv_asset_maintenance"("status");

-- CreateIndex
CREATE INDEX "inv_approval_rules_category_id_idx" ON "inv_approval_rules"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_dynamic_roles_institute_id_name_key" ON "inventory_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_user_dynamic_roles_institute_id_eddva_user_id_key" ON "inventory_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_user_dynamic_roles_institute_id_username_key" ON "inventory_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sso_sessions_inv_token_key" ON "inventory_sso_sessions"("inv_token");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_permissions_catalog_key_key" ON "inventory_permissions_catalog"("key");

-- AddForeignKey
ALTER TABLE "inv_categories" ADD CONSTRAINT "inv_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "inv_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_items" ADD CONSTRAINT "inv_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inv_categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_item_vendors" ADD CONSTRAINT "inv_item_vendors_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_item_vendors" ADD CONSTRAINT "inv_item_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "inv_vendors"("vendor_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_purchases" ADD CONSTRAINT "inv_stock_purchases_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_purchases" ADD CONSTRAINT "inv_stock_purchases_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "inv_vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_purchases" ADD CONSTRAINT "inv_stock_purchases_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_transfers" ADD CONSTRAINT "inv_stock_transfers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_transfers" ADD CONSTRAINT "inv_stock_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_transfers" ADD CONSTRAINT "inv_stock_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_adjustments" ADD CONSTRAINT "inv_stock_adjustments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_adjustments" ADD CONSTRAINT "inv_stock_adjustments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "inv_stock_purchases"("purchase_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inv_stock_transfers"("transfer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inv_stock_adjustments"("adjustment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "inv_asset_issues"("issue_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_ledger" ADD CONSTRAINT "inv_stock_ledger_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "inv_asset_returns"("return_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_balances" ADD CONSTRAINT "inv_stock_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_balances" ADD CONSTRAINT "inv_stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_units" ADD CONSTRAINT "inv_asset_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_units" ADD CONSTRAINT "inv_asset_units_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "inv_stock_purchases"("purchase_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_units" ADD CONSTRAINT "inv_asset_units_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "inv_locations"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_units" ADD CONSTRAINT "inv_asset_units_current_holder_id_fkey" FOREIGN KEY ("current_holder_id") REFERENCES "inv_holders"("holder_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_issues" ADD CONSTRAINT "inv_asset_issues_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_issues" ADD CONSTRAINT "inv_asset_issues_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "inv_asset_units"("asset_unit_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_issues" ADD CONSTRAINT "inv_asset_issues_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "inv_holders"("holder_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_issues" ADD CONSTRAINT "inv_asset_issues_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "inv_locations"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_issues" ADD CONSTRAINT "inv_asset_issues_approval_rule_id_fkey" FOREIGN KEY ("approval_rule_id") REFERENCES "inv_approval_rules"("rule_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_returns" ADD CONSTRAINT "inv_asset_returns_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "inv_asset_issues"("issue_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_asset_maintenance" ADD CONSTRAINT "inv_asset_maintenance_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "inv_asset_units"("asset_unit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_approval_rules" ADD CONSTRAINT "inv_approval_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inv_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_user_dynamic_roles" ADD CONSTRAINT "inventory_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "inventory_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;
