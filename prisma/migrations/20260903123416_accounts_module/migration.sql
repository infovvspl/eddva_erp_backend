-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'JOURNAL_VOUCHER';
ALTER TYPE "DocumentType" ADD VALUE 'PAYMENT_VOUCHER';
ALTER TYPE "DocumentType" ADD VALUE 'RECEIPT_VOUCHER';
ALTER TYPE "DocumentType" ADD VALUE 'CONTRA_VOUCHER';

-- CreateTable
CREATE TABLE "financial_years" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "fyLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialYearStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_groups" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "groupName" TEXT NOT NULL,
    "parentGroupId" TEXT,
    "nature" "AccountNature" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingBalanceType" "BalanceType" NOT NULL DEFAULT 'DEBIT',
    "allowVoucherEntry" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "voucher_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "voucherNumber" TEXT NOT NULL,
    "voucherTypeId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL,
    "narration" TEXT,
    "referenceNo" TEXT,
    "totalDebit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "isAutoPosted" BOOLEAN NOT NULL DEFAULT false,
    "sourceModule" TEXT,
    "sourceReferenceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_entries" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costCenterId" TEXT,
    "narration" TEXT,
    "voucherDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_attachments" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_period_balances" (
    "id" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "openingBalanceType" "BalanceType" NOT NULL,
    "closingBalance" DECIMAL(14,2) NOT NULL,
    "closingBalanceType" "BalanceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_period_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mappings" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT,
    "mappingKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_years_instituteId_status_idx" ON "financial_years"("instituteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_years_instituteId_fyLabel_key" ON "financial_years"("instituteId", "fyLabel");

-- CreateIndex
CREATE INDEX "account_groups_instituteId_idx" ON "account_groups"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_instituteId_groupName_key" ON "account_groups"("instituteId", "groupName");

-- CreateIndex
CREATE INDEX "ledger_accounts_instituteId_isActive_idx" ON "ledger_accounts"("instituteId", "isActive");

-- CreateIndex
CREATE INDEX "ledger_accounts_groupId_idx" ON "ledger_accounts"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_instituteId_accountCode_key" ON "ledger_accounts"("instituteId", "accountCode");

-- CreateIndex
CREATE INDEX "cost_centers_instituteId_idx" ON "cost_centers"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_instituteId_name_key" ON "cost_centers"("instituteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_types_code_key" ON "voucher_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_reversalOfId_key" ON "vouchers"("reversalOfId");

-- CreateIndex
CREATE INDEX "vouchers_fyId_status_idx" ON "vouchers"("fyId", "status");

-- CreateIndex
CREATE INDEX "vouchers_instituteId_voucherDate_idx" ON "vouchers"("instituteId", "voucherDate");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_voucherTypeId_fyId_voucherNumber_key" ON "vouchers"("voucherTypeId", "fyId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_sourceModule_sourceReferenceId_key" ON "vouchers"("sourceModule", "sourceReferenceId");

-- CreateIndex
CREATE INDEX "voucher_entries_accountId_voucherDate_idx" ON "voucher_entries"("accountId", "voucherDate");

-- CreateIndex
CREATE INDEX "voucher_entries_voucherId_idx" ON "voucher_entries"("voucherId");

-- CreateIndex
CREATE INDEX "voucher_attachments_voucherId_idx" ON "voucher_attachments"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "account_period_balances_fyId_accountId_key" ON "account_period_balances"("fyId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_mappings_instituteId_mappingKey_key" ON "account_mappings"("instituteId", "mappingKey");

-- AddForeignKey
ALTER TABLE "financial_years" ADD CONSTRAINT "financial_years_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "account_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_voucherTypeId_fkey" FOREIGN KEY ("voucherTypeId") REFERENCES "voucher_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_fyId_fkey" FOREIGN KEY ("fyId") REFERENCES "financial_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_attachments" ADD CONSTRAINT "voucher_attachments_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_attachments" ADD CONSTRAINT "voucher_attachments_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_period_balances" ADD CONSTRAINT "account_period_balances_fyId_fkey" FOREIGN KEY ("fyId") REFERENCES "financial_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_period_balances" ADD CONSTRAINT "account_period_balances_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: an entry cannot be both a debit and a credit, and neither side may be negative
ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_debit_credit_non_negative"
  CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0);

ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_not_both_debit_and_credit"
  CHECK (NOT ("debitAmount" > 0 AND "creditAmount" > 0));

ALTER TABLE "voucher_entries" ADD CONSTRAINT "voucher_entries_one_side_must_be_positive"
  CHECK ("debitAmount" > 0 OR "creditAmount" > 0);

-- CheckConstraint: voucher totals are never negative
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_totals_non_negative"
  CHECK ("totalDebit" >= 0 AND "totalCredit" >= 0);
