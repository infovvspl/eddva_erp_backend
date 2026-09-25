-- Clean removal of Masters, Parties, Purchase, Sales, Sales-Purchase, Reports modules.
-- These modules never got their own dynamic RBAC and are being rebuilt separately.

-- Drop number_sequences rows for document types that no longer have a producing module,
-- since the enum values below are being removed and the column cast would otherwise fail.
DELETE FROM "number_sequences" WHERE "documentType" IN ('PO', 'GRN', 'PURCHASE_INVOICE', 'SALES_ORDER', 'SALES_INVOICE', 'PAYMENT', 'RECEIPT');

-- approval_rules is dropped up front (not just its FK) so its documentType column
-- (still typed against the old enum) doesn't block dropping that enum type below.
-- DropForeignKey
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_requiredRoleId_fkey";

-- DropTable
DROP TABLE "approval_rules";

-- AlterEnum
BEGIN;
CREATE TYPE "DocumentType_new" AS ENUM ('VISITOR_BADGE', 'JOURNAL_VOUCHER', 'PAYMENT_VOUCHER', 'RECEIPT_VOUCHER', 'CONTRA_VOUCHER');
ALTER TABLE "number_sequences" ALTER COLUMN "documentType" TYPE "DocumentType_new" USING ("documentType"::text::"DocumentType_new");
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "DocumentType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "customer_contacts" DROP CONSTRAINT "customer_contacts_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_paymentTermId_fkey";

-- DropForeignKey
ALTER TABLE "goods_receipt_notes" DROP CONSTRAINT "goods_receipt_notes_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "goods_receipt_notes" DROP CONSTRAINT "goods_receipt_notes_poId_fkey";

-- DropForeignKey
ALTER TABLE "goods_receipt_notes" DROP CONSTRAINT "goods_receipt_notes_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "goods_receipt_notes" DROP CONSTRAINT "goods_receipt_notes_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT "grn_items_grnId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT "grn_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT "grn_items_poItemId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_itemId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_taxCodeId_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_uomId_fkey";

-- DropForeignKey
ALTER TABLE "po_approvals" DROP CONSTRAINT "po_approvals_approverId_fkey";

-- DropForeignKey
ALTER TABLE "po_approvals" DROP CONSTRAINT "po_approvals_poId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoice_items" DROP CONSTRAINT "purchase_invoice_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoice_items" DROP CONSTRAINT "purchase_invoice_items_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoice_items" DROP CONSTRAINT "purchase_invoice_items_taxCodeId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_grnId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_poId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_postedBy_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoices" DROP CONSTRAINT "purchase_invoices_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_poId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_taxCodeId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_approvedBy_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_payments" DROP CONSTRAINT "purchase_payments_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "purchase_payments" DROP CONSTRAINT "purchase_payments_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoice_items" DROP CONSTRAINT "sales_invoice_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoice_items" DROP CONSTRAINT "sales_invoice_items_salesInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoice_items" DROP CONSTRAINT "sales_invoice_items_taxCodeId_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoices" DROP CONSTRAINT "sales_invoices_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoices" DROP CONSTRAINT "sales_invoices_customerId_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoices" DROP CONSTRAINT "sales_invoices_postedBy_fkey";

-- DropForeignKey
ALTER TABLE "sales_invoices" DROP CONSTRAINT "sales_invoices_soId_fkey";

-- DropForeignKey
ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_soId_fkey";

-- DropForeignKey
ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_taxCodeId_fkey";

-- DropForeignKey
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_customerId_fkey";

-- DropForeignKey
ALTER TABLE "sales_receipts" DROP CONSTRAINT "sales_receipts_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "sales_receipts" DROP CONSTRAINT "sales_receipts_salesInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_bank_details" DROP CONSTRAINT "vendor_bank_details_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_contacts" DROP CONSTRAINT "vendor_contacts_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_paymentTermId_fkey";

-- DropTable
DROP TABLE "customer_contacts";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "goods_receipt_notes";

-- DropTable
DROP TABLE "grn_items";

-- DropTable
DROP TABLE "inventory_transactions";

-- DropTable
DROP TABLE "item_categories";

-- DropTable
DROP TABLE "items";

-- DropTable
DROP TABLE "payment_terms";

-- DropTable
DROP TABLE "po_approvals";

-- DropTable
DROP TABLE "purchase_invoice_items";

-- DropTable
DROP TABLE "purchase_invoices";

-- DropTable
DROP TABLE "purchase_order_items";

-- DropTable
DROP TABLE "purchase_orders";

-- DropTable
DROP TABLE "purchase_payments";

-- DropTable
DROP TABLE "sales_invoice_items";

-- DropTable
DROP TABLE "sales_invoices";

-- DropTable
DROP TABLE "sales_order_items";

-- DropTable
DROP TABLE "sales_orders";

-- DropTable
DROP TABLE "sales_receipts";

-- DropTable
DROP TABLE "tax_codes";

-- DropTable
DROP TABLE "uom";

-- DropTable
DROP TABLE "vendor_bank_details";

-- DropTable
DROP TABLE "vendor_contacts";

-- DropTable
DROP TABLE "vendors";

-- DropTable
DROP TABLE "warehouses";

-- DropEnum
DROP TYPE "GrnStatus";

-- DropEnum
DROP TYPE "InventoryTransactionType";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "PoApprovalAction";

-- DropEnum
DROP TYPE "PoStatus";

-- DropEnum
DROP TYPE "SoStatus";

-- DropEnum
DROP TYPE "VendorStatus";
