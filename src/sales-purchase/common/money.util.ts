import { Prisma } from '@prisma/client';

/**
 * All money/tax arithmetic in this module goes through Prisma.Decimal
 * (decimal.js) rather than plain JS numbers — unlike the simpler `qty *
 * price` used elsewhere in the codebase (e.g. Inventory's purchases
 * service), the chained PO → GRN → Invoice → Payment calculations here
 * compound rounding error if done in floating point. Explicit, spec-driven
 * deviation from the lighter-weight sibling-module convention (module spec
 * §6/§76: never use floating point for money).
 */
export type Decimalish = number | string | Prisma.Decimal;

export interface OrderLineInput {
  quantity: Decimalish;
  unit_price: Decimalish;
  line_discount?: Decimalish;
  /** Combined CGST+SGST+IGST %, used by PO/SO lines which store one line_tax_amount. */
  tax_pct?: Decimalish;
}

export interface OrderLineResult {
  line_subtotal: Prisma.Decimal;
  line_tax_amount: Prisma.Decimal;
  line_total: Prisma.Decimal;
}

export function calcOrderLine(input: OrderLineInput): OrderLineResult {
  const qty = new Prisma.Decimal(input.quantity);
  const price = new Prisma.Decimal(input.unit_price);
  const discount = new Prisma.Decimal(input.line_discount ?? 0);
  const taxPct = new Prisma.Decimal(input.tax_pct ?? 0);

  const gross = qty.mul(price);
  const taxable = gross.sub(discount);
  const line_tax_amount = taxable.mul(taxPct).div(100).toDecimalPlaces(2);
  const line_total = taxable.add(line_tax_amount).toDecimalPlaces(2);

  return {
    line_subtotal: taxable.toDecimalPlaces(2),
    line_tax_amount,
    line_total,
  };
}

export interface InvoiceLineInput {
  quantity: Decimalish;
  unit_price: Decimalish;
  line_discount?: Decimalish;
  cgst_pct?: Decimalish;
  sgst_pct?: Decimalish;
  igst_pct?: Decimalish;
}

export interface InvoiceLineResult {
  taxable_value: Prisma.Decimal;
  cgst_amount: Prisma.Decimal;
  sgst_amount: Prisma.Decimal;
  igst_amount: Prisma.Decimal;
  line_total: Prisma.Decimal;
}

export function calcInvoiceLine(input: InvoiceLineInput): InvoiceLineResult {
  const qty = new Prisma.Decimal(input.quantity);
  const price = new Prisma.Decimal(input.unit_price);
  const discount = new Prisma.Decimal(input.line_discount ?? 0);
  const cgstPct = new Prisma.Decimal(input.cgst_pct ?? 0);
  const sgstPct = new Prisma.Decimal(input.sgst_pct ?? 0);
  const igstPct = new Prisma.Decimal(input.igst_pct ?? 0);

  const gross = qty.mul(price);
  const taxable = gross.sub(discount);
  const cgst_amount = taxable.mul(cgstPct).div(100).toDecimalPlaces(2);
  const sgst_amount = taxable.mul(sgstPct).div(100).toDecimalPlaces(2);
  const igst_amount = taxable.mul(igstPct).div(100).toDecimalPlaces(2);
  const line_total = taxable
    .add(cgst_amount)
    .add(sgst_amount)
    .add(igst_amount)
    .toDecimalPlaces(2);

  return {
    taxable_value: taxable.toDecimalPlaces(2),
    cgst_amount,
    sgst_amount,
    igst_amount,
    line_total,
  };
}

export function sumDecimals(values: Decimalish[]): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const v of values) {
    total = total.add(new Prisma.Decimal(v));
  }
  return total;
}

export function toNumber(d: Decimalish): number {
  return new Prisma.Decimal(d).toNumber();
}
