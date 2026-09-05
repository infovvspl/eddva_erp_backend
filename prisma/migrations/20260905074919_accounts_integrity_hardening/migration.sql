-- CreateIndex
CREATE INDEX "voucher_entries_costCenterId_idx" ON "voucher_entries"("costCenterId");

-- CheckConstraint: an opening balance is always given a sign via openingBalanceType, so its magnitude must never be negative
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_opening_balance_non_negative"
  CHECK ("openingBalance" >= 0);
