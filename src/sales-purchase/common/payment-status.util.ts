import { SpPaymentStatus } from '@prisma/client';

/** Shared by purchase payments and sales receipts — see PurchasePaymentsService/SalesReceiptsService. */
export function resolvePaymentStatus(
  paid: number,
  grandTotal: number,
): SpPaymentStatus {
  if (paid <= 0) return SpPaymentStatus.UNPAID;
  if (paid >= grandTotal) return SpPaymentStatus.PAID;
  return SpPaymentStatus.PARTIALLY_PAID;
}
