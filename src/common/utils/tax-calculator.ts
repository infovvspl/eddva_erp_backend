export interface TaxCalculationResult {
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  lineTotal: number;
}

export function calculateLineTax(
  quantity: number,
  unitPrice: number,
  discount: number = 0,
  cgstPct: number = 0,
  sgstPct: number = 0,
  igstPct: number = 0,
  isInterstate: boolean = false,
): TaxCalculationResult {
  const gross = quantity * unitPrice;
  const taxableAmount = Math.max(0, gross - discount);

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (isInterstate) {
    igstAmount = Number(((taxableAmount * igstPct) / 100).toFixed(2));
  } else {
    cgstAmount = Number(((taxableAmount * cgstPct) / 100).toFixed(2));
    sgstAmount = Number(((taxableAmount * sgstPct) / 100).toFixed(2));
  }

  const totalTax = Number((cgstAmount + sgstAmount + igstAmount).toFixed(2));
  const lineTotal = Number((taxableAmount + totalTax).toFixed(2));

  return {
    subtotal: Number(taxableAmount.toFixed(2)),
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    lineTotal,
  };
}
