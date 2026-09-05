-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "isBankAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCashAccount" BOOLEAN NOT NULL DEFAULT false;
