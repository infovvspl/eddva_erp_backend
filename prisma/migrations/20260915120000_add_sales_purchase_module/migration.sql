-- CreateEnum
CREATE TYPE "SpPartyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "SpPaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "SpItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SpPoStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PARTIALLY_RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SpPoApprovalAction" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SpGrnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SpInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SpPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "SpSoStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_INVOICED', 'CLOSED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'SP_VENDOR';
ALTER TYPE "DocumentType" ADD VALUE 'SP_CUSTOMER';
ALTER TYPE "DocumentType" ADD VALUE 'SP_ITEM';
ALTER TYPE "DocumentType" ADD VALUE 'SP_WAREHOUSE';
ALTER TYPE "DocumentType" ADD VALUE 'SP_PURCHASE_ORDER';
ALTER TYPE "DocumentType" ADD VALUE 'SP_GRN';
ALTER TYPE "DocumentType" ADD VALUE 'SP_PURCHASE_INVOICE';
ALTER TYPE "DocumentType" ADD VALUE 'SP_SALES_ORDER';
ALTER TYPE "DocumentType" ADD VALUE 'SP_SALES_INVOICE';

-- CreateTable
CREATE TABLE "sp_vendors" (
    "vendor_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "gstin" TEXT,
    "tax_id" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "payment_term_id" INTEGER,
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SpPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_vendors_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "sp_vendor_contacts" (
    "contact_id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_vendor_contacts_pkey" PRIMARY KEY ("contact_id")
);

-- CreateTable
CREATE TABLE "sp_vendor_bank_details" (
    "bank_id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "account_no" TEXT NOT NULL,
    "ifsc" TEXT,
    "swift" TEXT,
    "bank_name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_vendor_bank_details_pkey" PRIMARY KEY ("bank_id")
);

-- CreateTable
CREATE TABLE "sp_customers" (
    "customer_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "gstin" TEXT,
    "tax_id" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "payment_term_id" INTEGER,
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SpPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "sp_customer_contacts" (
    "contact_id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_customer_contacts_pkey" PRIMARY KEY ("contact_id")
);

-- CreateTable
CREATE TABLE "sp_item_categories" (
    "category_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_item_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "sp_uoms" (
    "uom_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_uoms_pkey" PRIMARY KEY ("uom_id")
);

-- CreateTable
CREATE TABLE "sp_tax_codes" (
    "tax_code_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cgst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "effective_from" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "sp_tax_codes_pkey" PRIMARY KEY ("tax_code_id")
);

-- CreateTable
CREATE TABLE "sp_payment_terms" (
    "payment_term_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "term_name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_payment_terms_pkey" PRIMARY KEY ("payment_term_id")
);

-- CreateTable
CREATE TABLE "sp_warehouses" (
    "warehouse_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_warehouses_pkey" PRIMARY KEY ("warehouse_id")
);

-- CreateTable
CREATE TABLE "sp_items" (
    "item_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "uom_id" INTEGER NOT NULL,
    "hsn_sac_code" TEXT,
    "purchase_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sales_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_code_id" INTEGER,
    "status" "SpItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "sp_purchase_orders" (
    "po_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "po_date" DATE NOT NULL,
    "expected_delivery_date" DATE,
    "warehouse_id" INTEGER NOT NULL,
    "status" "SpPoStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_purchase_orders_pkey" PRIMARY KEY ("po_id")
);

-- CreateTable
CREATE TABLE "sp_purchase_order_items" (
    "po_item_id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_code_id" INTEGER,
    "line_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "received_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_purchase_order_items_pkey" PRIMARY KEY ("po_item_id")
);

-- CreateTable
CREATE TABLE "sp_po_approvals" (
    "approval_id" SERIAL NOT NULL,
    "po_id" INTEGER NOT NULL,
    "approver_id" TEXT NOT NULL,
    "action" "SpPoApprovalAction" NOT NULL,
    "remarks" TEXT,
    "action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sp_po_approvals_pkey" PRIMARY KEY ("approval_id")
);

-- CreateTable
CREATE TABLE "sp_approval_rules" (
    "rule_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "max_amount" DECIMAL(14,2),
    "approver_role_id" INTEGER,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_approval_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "sp_grns" (
    "grn_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "grn_number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "received_date" DATE NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "status" "SpGrnStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_grns_pkey" PRIMARY KEY ("grn_id")
);

-- CreateTable
CREATE TABLE "sp_grn_items" (
    "grn_item_id" SERIAL NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "po_item_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "received_qty" DECIMAL(14,3) NOT NULL,
    "accepted_qty" DECIMAL(14,3) NOT NULL,
    "rejected_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sp_grn_items_pkey" PRIMARY KEY ("grn_item_id")
);

-- CreateTable
CREATE TABLE "sp_purchase_invoices" (
    "pi_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "vendor_invoice_number" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "purchase_order_id" INTEGER,
    "grn_id" INTEGER,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_status" "SpPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "status" "SpInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "posted_by" TEXT,
    "posted_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_purchase_invoices_pkey" PRIMARY KEY ("pi_id")
);

-- CreateTable
CREATE TABLE "sp_purchase_invoice_items" (
    "pi_item_id" SERIAL NOT NULL,
    "pi_id" INTEGER NOT NULL,
    "po_item_id" INTEGER,
    "grn_item_id" INTEGER,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sp_purchase_invoice_items_pkey" PRIMARY KEY ("pi_item_id")
);

-- CreateTable
CREATE TABLE "sp_purchase_payments" (
    "payment_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "pi_id" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "SpPaymentMode" NOT NULL,
    "reference_no" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_purchase_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "sp_sales_orders" (
    "so_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "so_number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "so_date" DATE NOT NULL,
    "delivery_date" DATE,
    "status" "SpSoStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_sales_orders_pkey" PRIMARY KEY ("so_id")
);

-- CreateTable
CREATE TABLE "sp_sales_order_items" (
    "so_item_id" SERIAL NOT NULL,
    "sales_order_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_code_id" INTEGER,
    "line_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiced_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_sales_order_items_pkey" PRIMARY KEY ("so_item_id")
);

-- CreateTable
CREATE TABLE "sp_sales_invoices" (
    "si_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sales_order_id" INTEGER,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_status" "SpPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "status" "SpInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "posted_by" TEXT,
    "posted_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_sales_invoices_pkey" PRIMARY KEY ("si_id")
);

-- CreateTable
CREATE TABLE "sp_sales_invoice_items" (
    "si_item_id" SERIAL NOT NULL,
    "si_id" INTEGER NOT NULL,
    "so_item_id" INTEGER,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sp_sales_invoice_items_pkey" PRIMARY KEY ("si_item_id")
);

-- CreateTable
CREATE TABLE "sp_sales_receipts" (
    "receipt_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "si_id" INTEGER NOT NULL,
    "receipt_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "SpPaymentMode" NOT NULL,
    "reference_no" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_sales_receipts_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "sales_purchase_dynamic_roles" (
    "role_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_purchase_dynamic_roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "sales_purchase_user_dynamic_roles" (
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

    CONSTRAINT "sales_purchase_user_dynamic_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_purchase_sso_sessions" (
    "session_id" SERIAL NOT NULL,
    "institute_id" TEXT NOT NULL,
    "eddva_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT,
    "user_role" TEXT NOT NULL,
    "sp_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_purchase_sso_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "sales_purchase_permissions_catalog" (
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

    CONSTRAINT "sales_purchase_permissions_catalog_pkey" PRIMARY KEY ("permission_id")
);

-- CreateIndex
CREATE INDEX "sp_vendors_institute_id_status_idx" ON "sp_vendors"("institute_id", "status");

-- CreateIndex
CREATE INDEX "sp_vendors_vendor_name_idx" ON "sp_vendors"("vendor_name");

-- CreateIndex
CREATE INDEX "sp_vendors_gstin_idx" ON "sp_vendors"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "sp_vendors_institute_id_vendor_code_key" ON "sp_vendors"("institute_id", "vendor_code");

-- CreateIndex
CREATE INDEX "sp_vendor_contacts_vendor_id_idx" ON "sp_vendor_contacts"("vendor_id");

-- CreateIndex
CREATE INDEX "sp_vendor_bank_details_vendor_id_idx" ON "sp_vendor_bank_details"("vendor_id");

-- CreateIndex
CREATE INDEX "sp_customers_institute_id_status_idx" ON "sp_customers"("institute_id", "status");

-- CreateIndex
CREATE INDEX "sp_customers_customer_name_idx" ON "sp_customers"("customer_name");

-- CreateIndex
CREATE INDEX "sp_customers_gstin_idx" ON "sp_customers"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "sp_customers_institute_id_customer_code_key" ON "sp_customers"("institute_id", "customer_code");

-- CreateIndex
CREATE INDEX "sp_customer_contacts_customer_id_idx" ON "sp_customer_contacts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sp_item_categories_institute_id_name_key" ON "sp_item_categories"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sp_uoms_institute_id_name_key" ON "sp_uoms"("institute_id", "name");

-- CreateIndex
CREATE INDEX "sp_tax_codes_institute_id_name_effective_from_idx" ON "sp_tax_codes"("institute_id", "name", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "sp_payment_terms_institute_id_term_name_key" ON "sp_payment_terms"("institute_id", "term_name");

-- CreateIndex
CREATE UNIQUE INDEX "sp_warehouses_institute_id_name_key" ON "sp_warehouses"("institute_id", "name");

-- CreateIndex
CREATE INDEX "sp_items_institute_id_status_idx" ON "sp_items"("institute_id", "status");

-- CreateIndex
CREATE INDEX "sp_items_item_name_idx" ON "sp_items"("item_name");

-- CreateIndex
CREATE UNIQUE INDEX "sp_items_institute_id_item_code_key" ON "sp_items"("institute_id", "item_code");

-- CreateIndex
CREATE INDEX "sp_purchase_orders_institute_id_status_idx" ON "sp_purchase_orders"("institute_id", "status");

-- CreateIndex
CREATE INDEX "sp_purchase_orders_vendor_id_idx" ON "sp_purchase_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "sp_purchase_orders_po_date_idx" ON "sp_purchase_orders"("po_date");

-- CreateIndex
CREATE UNIQUE INDEX "sp_purchase_orders_institute_id_po_number_key" ON "sp_purchase_orders"("institute_id", "po_number");

-- CreateIndex
CREATE INDEX "sp_purchase_order_items_purchase_order_id_idx" ON "sp_purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "sp_purchase_order_items_item_id_idx" ON "sp_purchase_order_items"("item_id");

-- CreateIndex
CREATE INDEX "sp_po_approvals_po_id_idx" ON "sp_po_approvals"("po_id");

-- CreateIndex
CREATE INDEX "sp_approval_rules_institute_id_is_active_min_amount_idx" ON "sp_approval_rules"("institute_id", "is_active", "min_amount");

-- CreateIndex
CREATE INDEX "sp_grns_institute_id_status_idx" ON "sp_grns"("institute_id", "status");

-- CreateIndex
CREATE INDEX "sp_grns_purchase_order_id_idx" ON "sp_grns"("purchase_order_id");

-- CreateIndex
CREATE INDEX "sp_grns_vendor_id_idx" ON "sp_grns"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "sp_grns_institute_id_grn_number_key" ON "sp_grns"("institute_id", "grn_number");

-- CreateIndex
CREATE INDEX "sp_grn_items_grn_id_idx" ON "sp_grn_items"("grn_id");

-- CreateIndex
CREATE INDEX "sp_grn_items_po_item_id_idx" ON "sp_grn_items"("po_item_id");

-- CreateIndex
CREATE INDEX "sp_purchase_invoices_institute_id_status_invoice_date_idx" ON "sp_purchase_invoices"("institute_id", "status", "invoice_date");

-- CreateIndex
CREATE INDEX "sp_purchase_invoices_vendor_id_idx" ON "sp_purchase_invoices"("vendor_id");

-- CreateIndex
CREATE INDEX "sp_purchase_invoices_purchase_order_id_idx" ON "sp_purchase_invoices"("purchase_order_id");

-- CreateIndex
CREATE INDEX "sp_purchase_invoices_grn_id_idx" ON "sp_purchase_invoices"("grn_id");

-- CreateIndex
CREATE INDEX "sp_purchase_invoices_vendor_invoice_number_idx" ON "sp_purchase_invoices"("vendor_invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "sp_purchase_invoices_institute_id_invoice_number_key" ON "sp_purchase_invoices"("institute_id", "invoice_number");

-- CreateIndex
CREATE INDEX "sp_purchase_invoice_items_pi_id_idx" ON "sp_purchase_invoice_items"("pi_id");

-- CreateIndex
CREATE INDEX "sp_purchase_invoice_items_item_id_idx" ON "sp_purchase_invoice_items"("item_id");

-- CreateIndex
CREATE INDEX "sp_purchase_payments_pi_id_idx" ON "sp_purchase_payments"("pi_id");

-- CreateIndex
CREATE INDEX "sp_purchase_payments_institute_id_payment_date_idx" ON "sp_purchase_payments"("institute_id", "payment_date");

-- CreateIndex
CREATE INDEX "sp_sales_orders_institute_id_status_idx" ON "sp_sales_orders"("institute_id", "status");

-- CreateIndex
CREATE INDEX "sp_sales_orders_customer_id_idx" ON "sp_sales_orders"("customer_id");

-- CreateIndex
CREATE INDEX "sp_sales_orders_so_date_idx" ON "sp_sales_orders"("so_date");

-- CreateIndex
CREATE UNIQUE INDEX "sp_sales_orders_institute_id_so_number_key" ON "sp_sales_orders"("institute_id", "so_number");

-- CreateIndex
CREATE INDEX "sp_sales_order_items_sales_order_id_idx" ON "sp_sales_order_items"("sales_order_id");

-- CreateIndex
CREATE INDEX "sp_sales_order_items_item_id_idx" ON "sp_sales_order_items"("item_id");

-- CreateIndex
CREATE INDEX "sp_sales_invoices_institute_id_status_invoice_date_idx" ON "sp_sales_invoices"("institute_id", "status", "invoice_date");

-- CreateIndex
CREATE INDEX "sp_sales_invoices_customer_id_idx" ON "sp_sales_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sp_sales_invoices_sales_order_id_idx" ON "sp_sales_invoices"("sales_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sp_sales_invoices_institute_id_invoice_number_key" ON "sp_sales_invoices"("institute_id", "invoice_number");

-- CreateIndex
CREATE INDEX "sp_sales_invoice_items_si_id_idx" ON "sp_sales_invoice_items"("si_id");

-- CreateIndex
CREATE INDEX "sp_sales_invoice_items_item_id_idx" ON "sp_sales_invoice_items"("item_id");

-- CreateIndex
CREATE INDEX "sp_sales_receipts_si_id_idx" ON "sp_sales_receipts"("si_id");

-- CreateIndex
CREATE INDEX "sp_sales_receipts_institute_id_receipt_date_idx" ON "sp_sales_receipts"("institute_id", "receipt_date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_purchase_dynamic_roles_institute_id_name_key" ON "sales_purchase_dynamic_roles"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sales_purchase_user_dynamic_roles_institute_id_eddva_user_i_key" ON "sales_purchase_user_dynamic_roles"("institute_id", "eddva_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_purchase_user_dynamic_roles_institute_id_username_key" ON "sales_purchase_user_dynamic_roles"("institute_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "sales_purchase_sso_sessions_sp_token_key" ON "sales_purchase_sso_sessions"("sp_token");

-- CreateIndex
CREATE UNIQUE INDEX "sales_purchase_permissions_catalog_key_key" ON "sales_purchase_permissions_catalog"("key");

-- AddForeignKey
ALTER TABLE "sp_vendors" ADD CONSTRAINT "sp_vendors_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "sp_payment_terms"("payment_term_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_vendor_contacts" ADD CONSTRAINT "sp_vendor_contacts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "sp_vendors"("vendor_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_vendor_bank_details" ADD CONSTRAINT "sp_vendor_bank_details_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "sp_vendors"("vendor_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_customers" ADD CONSTRAINT "sp_customers_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "sp_payment_terms"("payment_term_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_customer_contacts" ADD CONSTRAINT "sp_customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sp_customers"("customer_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_items" ADD CONSTRAINT "sp_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "sp_item_categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_items" ADD CONSTRAINT "sp_items_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "sp_uoms"("uom_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_items" ADD CONSTRAINT "sp_items_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "sp_tax_codes"("tax_code_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_orders" ADD CONSTRAINT "sp_purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "sp_vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_orders" ADD CONSTRAINT "sp_purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "sp_warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_order_items" ADD CONSTRAINT "sp_purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "sp_purchase_orders"("po_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_order_items" ADD CONSTRAINT "sp_purchase_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "sp_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_order_items" ADD CONSTRAINT "sp_purchase_order_items_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "sp_tax_codes"("tax_code_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_po_approvals" ADD CONSTRAINT "sp_po_approvals_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "sp_purchase_orders"("po_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_approval_rules" ADD CONSTRAINT "sp_approval_rules_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "sales_purchase_dynamic_roles"("role_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_grns" ADD CONSTRAINT "sp_grns_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "sp_purchase_orders"("po_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_grns" ADD CONSTRAINT "sp_grns_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "sp_vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_grns" ADD CONSTRAINT "sp_grns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "sp_warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_grn_items" ADD CONSTRAINT "sp_grn_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "sp_grns"("grn_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_grn_items" ADD CONSTRAINT "sp_grn_items_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "sp_purchase_order_items"("po_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_grn_items" ADD CONSTRAINT "sp_grn_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "sp_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoices" ADD CONSTRAINT "sp_purchase_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "sp_vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoices" ADD CONSTRAINT "sp_purchase_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "sp_purchase_orders"("po_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoices" ADD CONSTRAINT "sp_purchase_invoices_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "sp_grns"("grn_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoice_items" ADD CONSTRAINT "sp_purchase_invoice_items_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "sp_purchase_invoices"("pi_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoice_items" ADD CONSTRAINT "sp_purchase_invoice_items_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "sp_purchase_order_items"("po_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoice_items" ADD CONSTRAINT "sp_purchase_invoice_items_grn_item_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "sp_grn_items"("grn_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_invoice_items" ADD CONSTRAINT "sp_purchase_invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "sp_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_purchase_payments" ADD CONSTRAINT "sp_purchase_payments_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "sp_purchase_invoices"("pi_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_orders" ADD CONSTRAINT "sp_sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sp_customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_order_items" ADD CONSTRAINT "sp_sales_order_items_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sp_sales_orders"("so_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_order_items" ADD CONSTRAINT "sp_sales_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "sp_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_order_items" ADD CONSTRAINT "sp_sales_order_items_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "sp_tax_codes"("tax_code_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_invoices" ADD CONSTRAINT "sp_sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sp_customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_invoices" ADD CONSTRAINT "sp_sales_invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sp_sales_orders"("so_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_invoice_items" ADD CONSTRAINT "sp_sales_invoice_items_si_id_fkey" FOREIGN KEY ("si_id") REFERENCES "sp_sales_invoices"("si_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_invoice_items" ADD CONSTRAINT "sp_sales_invoice_items_so_item_id_fkey" FOREIGN KEY ("so_item_id") REFERENCES "sp_sales_order_items"("so_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_invoice_items" ADD CONSTRAINT "sp_sales_invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "sp_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sp_sales_receipts" ADD CONSTRAINT "sp_sales_receipts_si_id_fkey" FOREIGN KEY ("si_id") REFERENCES "sp_sales_invoices"("si_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_purchase_user_dynamic_roles" ADD CONSTRAINT "sales_purchase_user_dynamic_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sales_purchase_dynamic_roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

