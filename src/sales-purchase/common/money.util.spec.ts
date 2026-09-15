import {
  calcInvoiceLine,
  calcOrderLine,
  sumDecimals,
  toNumber,
} from './money.util';

describe('calcOrderLine', () => {
  it('computes subtotal, tax, and total for a simple line', () => {
    const result = calcOrderLine({
      quantity: 10,
      unit_price: 100,
      tax_pct: 18,
    });
    expect(toNumber(result.line_subtotal)).toBe(1000);
    expect(toNumber(result.line_tax_amount)).toBe(180);
    expect(toNumber(result.line_total)).toBe(1180);
  });

  it('applies line discount before computing tax', () => {
    const result = calcOrderLine({
      quantity: 10,
      unit_price: 100,
      line_discount: 100,
      tax_pct: 18,
    });
    expect(toNumber(result.line_subtotal)).toBe(900);
    expect(toNumber(result.line_tax_amount)).toBe(162);
    expect(toNumber(result.line_total)).toBe(1062);
  });

  it('defaults discount and tax to zero', () => {
    const result = calcOrderLine({ quantity: 3, unit_price: 50 });
    expect(toNumber(result.line_total)).toBe(150);
    expect(toNumber(result.line_tax_amount)).toBe(0);
  });

  it('rounds to 2 decimal places (no floating-point drift across many lines)', () => {
    // 3 * 33.33 = 99.99 exactly; a naive float sum of ten of these can drift.
    let total = 0;
    for (let i = 0; i < 10; i++) {
      total += toNumber(
        calcOrderLine({ quantity: 3, unit_price: 33.33 }).line_total,
      );
    }
    expect(Math.round(total * 100) / 100).toBe(999.9);
  });
});

describe('calcInvoiceLine', () => {
  it('splits tax across cgst/sgst/igst independently and sums into line_total', () => {
    const result = calcInvoiceLine({
      quantity: 10,
      unit_price: 100,
      cgst_pct: 9,
      sgst_pct: 9,
      igst_pct: 0,
    });
    expect(toNumber(result.cgst_amount)).toBe(90);
    expect(toNumber(result.sgst_amount)).toBe(90);
    expect(toNumber(result.igst_amount)).toBe(0);
    expect(toNumber(result.line_total)).toBe(1180);
  });

  it('applies discount before tax', () => {
    const result = calcInvoiceLine({
      quantity: 10,
      unit_price: 100,
      line_discount: 200,
      cgst_pct: 9,
      sgst_pct: 9,
      igst_pct: 0,
    });
    expect(toNumber(result.taxable_value)).toBe(800);
    expect(toNumber(result.cgst_amount)).toBe(72);
    expect(toNumber(result.sgst_amount)).toBe(72);
    expect(toNumber(result.line_total)).toBe(944);
  });
});

describe('sumDecimals', () => {
  it('sums a mix of numbers, strings, and Decimals precisely', () => {
    expect(toNumber(sumDecimals([100, '50.5', 0.25]))).toBe(150.75);
  });

  it('returns zero for an empty array', () => {
    expect(toNumber(sumDecimals([]))).toBe(0);
  });
});
