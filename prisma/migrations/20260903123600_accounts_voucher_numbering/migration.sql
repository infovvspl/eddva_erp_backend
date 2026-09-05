-- CreateTable
CREATE TABLE "voucher_number_sequences" (
    "id" TEXT NOT NULL,
    "voucherTypeId" TEXT NOT NULL,
    "fyId" TEXT NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "voucher_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voucher_number_sequences_voucherTypeId_fyId_key" ON "voucher_number_sequences"("voucherTypeId", "fyId");
