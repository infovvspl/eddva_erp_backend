import { PrismaClient } from '@prisma/client';

/**
 * Transactional demo data for the Sales & Purchase module dashboard
 * (src/sales-purchase/dashboard/dashboard.service.ts), spanning the last ~6
 * months (May 2026 - Oct 2026, institute "today" = 2026-10-14).
 *
 * Builds on the masters created by prisma/seed.ts for institute_id
 * 'INST_DEMO_101': vendors VN/SEED/00001-2, customers CN/SEED/00002-2,
 * items IT/SEED/00001-4, warehouse "Main Store", payment terms, tax codes.
 *
 * Replicates (in plain numbers, not Prisma.Decimal — fine for seed data)
 * the same line-item tax math as src/sales-purchase/common/money.util.ts:
 * taxable = qty*price - line_discount; cgst/sgst/igst = taxable * pct / 100;
 * line_total = taxable + cgst + sgst + igst.
 *
 * Safe to re-run: guarded by a row-count check on sales invoices whose
 * invoice_number starts with the 'SINV/SEED' prefix this script uses.
 */

const FINANCIAL_YEAR = '2026-27';
const CREATED_BY = 'usr_sp_admin_demo';
const GUARD_PREFIX = 'SINV/SEED';
const GUARD_THRESHOLD = 15;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pad(n: number, width = 5): string {
  return String(n).padStart(width, '0');
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length];
}

/** Six calendar months: May 2026 through Oct 2026 (Oct capped at "today", the 14th). */
const MONTHS: Array<{ year: number; month: number; maxDay: number }> = [
  { year: 2026, month: 5, maxDay: 31 },
  { year: 2026, month: 6, maxDay: 30 },
  { year: 2026, month: 7, maxDay: 31 },
  { year: 2026, month: 8, maxDay: 31 },
  { year: 2026, month: 9, maxDay: 30 },
  { year: 2026, month: 10, maxDay: 14 },
];

function dateInMonth(monthIdx: number, day: number): Date {
  const m = MONTHS[monthIdx % MONTHS.length];
  const clampedDay = Math.min(day, m.maxDay);
  return new Date(Date.UTC(m.year, m.month - 1, clampedDay));
}

function addDays(d: Date, days: number): Date {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + days);
  return nd;
}

interface LineCalc {
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
}

function calcInvoiceLine(
  qty: number,
  unitPrice: number,
  lineDiscount: number,
  cgstPct: number,
  sgstPct: number,
  igstPct: number,
): LineCalc {
  const gross = qty * unitPrice;
  const taxable = gross - lineDiscount;
  const cgst_amount = round2((taxable * cgstPct) / 100);
  const sgst_amount = round2((taxable * sgstPct) / 100);
  const igst_amount = round2((taxable * igstPct) / 100);
  const line_total = round2(taxable + cgst_amount + sgst_amount + igst_amount);
  return { taxable_value: round2(taxable), cgst_amount, sgst_amount, igst_amount, line_total };
}

function calcOrderLine(qty: number, unitPrice: number, lineDiscount: number, combinedTaxPct: number) {
  const gross = qty * unitPrice;
  const taxable = gross - lineDiscount;
  const line_tax_amount = round2((taxable * combinedTaxPct) / 100);
  const line_total = round2(taxable + line_tax_amount);
  return { line_subtotal: round2(taxable), line_tax_amount, line_total };
}

export async function seedSalesPurchase(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.spSalesInvoice.count({
    where: { institute_id: instId, invoice_number: { startsWith: GUARD_PREFIX } },
  });
  if (existing >= GUARD_THRESHOLD) {
    console.log(`  (sales-purchase) already has ${existing} seeded sales invoices — skipping`);
    return;
  }

  const [vendors, customers, items, warehouse] = await Promise.all([
    prisma.spVendor.findMany({ where: { institute_id: instId, vendor_code: { startsWith: 'VN/SEED/' } }, orderBy: { vendor_code: 'asc' } }),
    prisma.spCustomer.findMany({ where: { institute_id: instId, customer_code: { startsWith: 'CN/SEED/' } }, orderBy: { customer_code: 'asc' } }),
    prisma.spItem.findMany({ where: { institute_id: instId, item_code: { startsWith: 'IT/SEED/' } }, include: { tax_code: true }, orderBy: { item_code: 'asc' } }),
    prisma.spWarehouse.findFirst({ where: { institute_id: instId, name: 'Main Store' } }),
  ]);

  if (vendors.length === 0 || customers.length === 0 || items.length === 0 || !warehouse) {
    console.warn('  (sales-purchase) base masters (vendors/customers/items/warehouse) not found — run prisma/seed.ts first. Skipping.');
    return;
  }

  const itemTax = (itemId: number) => {
    const item = items.find((i) => i.item_id === itemId)!;
    const cgst = item.tax_code ? Number(item.tax_code.cgst_pct) : 0;
    const sgst = item.tax_code ? Number(item.tax_code.sgst_pct) : 0;
    const igst = item.tax_code ? Number(item.tax_code.igst_pct) : 0;
    return { cgst, sgst, igst, tax_code_id: item.tax_code_id ?? undefined };
  };

  function randomLines(count: number) {
    const chosen: Array<{ item_id: number; quantity: number; unit_price: number }> = [];
    for (let i = 0; i < count; i++) {
      const item = items[randInt(0, items.length - 1)];
      const qty = item.item_name === 'Paper (Ream)' ? randInt(5, 25) : randInt(1, 6);
      chosen.push({ item_id: item.item_id, quantity: qty, unit_price: Number(item.purchase_price) });
    }
    return chosen;
  }

  // ───────────────────────── PURCHASE SIDE ─────────────────────────
  console.log('  (sales-purchase) seeding purchase orders, GRNs, invoices & payments...');

  const PO_LINKED_COUNT = 20;
  const poRecords: Array<{ po_id: number; vendor_id: number; po_date: Date; items: Array<{ po_item_id: number; item_id: number; quantity: number; unit_price: number; tax_code_id?: number }> }> = [];

  for (let i = 0; i < PO_LINKED_COUNT; i++) {
    const monthIdx = i % MONTHS.length;
    const poDate = dateInMonth(monthIdx, randInt(1, 25));
    const vendor = pick(vendors, i);
    const lines = randomLines(randInt(1, 3));

    let subtotal = 0;
    let taxAmount = 0;
    const builtLines = lines.map((l) => {
      const tax = itemTax(l.item_id);
      const combinedPct = tax.cgst + tax.sgst + tax.igst;
      const calc = calcOrderLine(l.quantity, l.unit_price, 0, combinedPct);
      subtotal += calc.line_subtotal;
      taxAmount += calc.line_tax_amount;
      return {
        item_id: l.item_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_code_id: tax.tax_code_id,
        line_discount: 0,
        line_tax_amount: calc.line_tax_amount,
        line_total: calc.line_total,
        received_qty: l.quantity,
      };
    });
    const grandTotal = round2(subtotal + taxAmount);

    const po = await prisma.spPurchaseOrder.create({
      data: {
        institute_id: instId,
        po_number: `PO/SEED/26-27/${pad(i + 1)}`,
        financial_year: FINANCIAL_YEAR,
        vendor_id: vendor.vendor_id,
        po_date: poDate,
        expected_delivery_date: addDays(poDate, 7),
        warehouse_id: warehouse.warehouse_id,
        status: 'APPROVED',
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount: 0,
        grand_total: grandTotal,
        created_by: CREATED_BY,
        submitted_at: poDate,
        approved_by: CREATED_BY,
        approved_at: addDays(poDate, 1),
        items: { create: builtLines.map(({ received_qty, ...rest }) => ({ ...rest, received_qty })) },
      },
      include: { items: true },
    });

    poRecords.push({
      po_id: po.po_id,
      vendor_id: vendor.vendor_id,
      po_date: poDate,
      items: po.items.map((it) => ({
        po_item_id: it.po_item_id,
        item_id: it.item_id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        tax_code_id: it.tax_code_id ?? undefined,
      })),
    });
  }

  // A few standalone POs purely for status-breakdown variety (no GRN/invoice chain).
  const extraStatuses: Array<'DRAFT' | 'PENDING_APPROVAL' | 'REJECTED' | 'CLOSED'> = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CLOSED'];
  for (let i = 0; i < extraStatuses.length; i++) {
    const monthIdx = (PO_LINKED_COUNT + i) % MONTHS.length;
    const poDate = dateInMonth(monthIdx, randInt(1, 25));
    const vendor = pick(vendors, i);
    const lines = randomLines(1);
    const tax = itemTax(lines[0].item_id);
    const combinedPct = tax.cgst + tax.sgst + tax.igst;
    const calc = calcOrderLine(lines[0].quantity, lines[0].unit_price, 0, combinedPct);
    await prisma.spPurchaseOrder.create({
      data: {
        institute_id: instId,
        po_number: `PO/SEED/26-27/${pad(PO_LINKED_COUNT + i + 1)}`,
        financial_year: FINANCIAL_YEAR,
        vendor_id: vendor.vendor_id,
        po_date: poDate,
        warehouse_id: warehouse.warehouse_id,
        status: extraStatuses[i],
        subtotal: calc.line_subtotal,
        tax_amount: calc.line_tax_amount,
        discount: 0,
        grand_total: calc.line_total,
        created_by: CREATED_BY,
        submitted_at: extraStatuses[i] === 'DRAFT' ? null : poDate,
        rejected_by: extraStatuses[i] === 'REJECTED' ? CREATED_BY : undefined,
        rejected_at: extraStatuses[i] === 'REJECTED' ? addDays(poDate, 1) : undefined,
        items: {
          create: [
            {
              item_id: lines[0].item_id,
              quantity: lines[0].quantity,
              unit_price: lines[0].unit_price,
              tax_code_id: tax.tax_code_id,
              line_discount: 0,
              line_tax_amount: calc.line_tax_amount,
              line_total: calc.line_total,
            },
          ],
        },
      },
    });
  }

  // GRNs against the 20 linked/approved POs (last one left DRAFT for status variety).
  const grnRecords: Array<{ grn_id: number; po_id: number; vendor_id: number; received_date: Date; items: Array<{ grn_item_id: number; po_item_id: number; item_id: number; accepted_qty: number }> }> = [];
  for (let i = 0; i < poRecords.length; i++) {
    const po = poRecords[i];
    const receivedDate = addDays(po.po_date, randInt(2, 6));
    const grnStatus = i === poRecords.length - 1 ? 'DRAFT' : 'POSTED';
    const grn = await prisma.spGrn.create({
      data: {
        institute_id: instId,
        grn_number: `GRN/SEED/26-27/${pad(i + 1)}`,
        financial_year: FINANCIAL_YEAR,
        purchase_order_id: po.po_id,
        vendor_id: po.vendor_id,
        received_date: receivedDate,
        warehouse_id: warehouse.warehouse_id,
        status: grnStatus,
        created_by: CREATED_BY,
        items: {
          create: po.items.map((it) => ({
            po_item_id: it.po_item_id,
            item_id: it.item_id,
            received_qty: it.quantity,
            accepted_qty: it.quantity,
            rejected_qty: 0,
          })),
        },
      },
      include: { items: true },
    });
    grnRecords.push({
      grn_id: grn.grn_id,
      po_id: po.po_id,
      vendor_id: po.vendor_id,
      received_date: receivedDate,
      items: grn.items.map((gi) => ({ grn_item_id: gi.grn_item_id, po_item_id: gi.po_item_id, item_id: gi.item_id, accepted_qty: Number(gi.accepted_qty) })),
    });
  }

  // Purchase invoices: one per POSTED GRN, plus 3 standalone (no PO/GRN) invoices.
  const postedGrns = grnRecords.filter((_, i) => i !== grnRecords.length - 1);
  let piIndex = 0;
  const purchaseInvoiceStatusPlan = (i: number): 'POSTED' | 'DRAFT' | 'CANCELLED' => {
    if (i === postedGrns.length - 1) return 'DRAFT';
    if (i === postedGrns.length - 2) return 'CANCELLED';
    return 'POSTED';
  };

  for (let i = 0; i < postedGrns.length; i++) {
    const grn = postedGrns[i];
    const po = poRecords.find((p) => p.po_id === grn.po_id)!;
    const invoiceDate = addDays(grn.received_date, randInt(0, 3));
    const dueDate = addDays(invoiceDate, 30);
    const status = purchaseInvoiceStatusPlan(i);

    let subtotal = 0;
    let taxAmount = 0;
    const lineData = grn.items.map((gi) => {
      const poLine = po.items.find((p) => p.po_item_id === gi.po_item_id)!;
      const tax = itemTax(gi.item_id);
      const calc = calcInvoiceLine(gi.accepted_qty, poLine.unit_price, 0, tax.cgst, tax.sgst, tax.igst);
      subtotal += calc.taxable_value;
      taxAmount += calc.cgst_amount + calc.sgst_amount + calc.igst_amount;
      return {
        po_item_id: gi.po_item_id,
        grn_item_id: gi.grn_item_id,
        item_id: gi.item_id,
        quantity: gi.accepted_qty,
        unit_price: poLine.unit_price,
        cgst_rate: tax.cgst,
        sgst_rate: tax.sgst,
        igst_rate: tax.igst,
        cgst_amount: calc.cgst_amount,
        sgst_amount: calc.sgst_amount,
        igst_amount: calc.igst_amount,
        line_discount: 0,
        line_total: calc.line_total,
      };
    });
    const grandTotal = round2(subtotal + taxAmount);

    // Payment status distribution: ~55% PAID, ~25% PARTIALLY_PAID, ~20% UNPAID.
    const mod = piIndex % 5;
    let paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' = 'PAID';
    let paidAmount = grandTotal;
    if (mod === 3) {
      paymentStatus = 'PARTIALLY_PAID';
      paidAmount = round2(grandTotal * (0.3 + Math.random() * 0.3));
    } else if (mod === 4) {
      paymentStatus = 'UNPAID';
      paidAmount = 0;
    }
    if (status !== 'POSTED') {
      // DRAFT/CANCELLED invoices never carry a payment status in practice.
      paymentStatus = 'UNPAID';
      paidAmount = 0;
    }

    const invoice = await prisma.spPurchaseInvoice.create({
      data: {
        institute_id: instId,
        invoice_number: `PINV/SEED/26-27/${pad(piIndex + 1)}`,
        financial_year: FINANCIAL_YEAR,
        vendor_invoice_number: `VEND-${po.vendor_id}-${pad(piIndex + 1, 4)}`,
        vendor_id: grn.vendor_id,
        purchase_order_id: po.po_id,
        grn_id: grn.grn_id,
        invoice_date: invoiceDate,
        due_date: dueDate,
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount: 0,
        grand_total: grandTotal,
        paid_amount: paidAmount,
        payment_status: paymentStatus,
        status,
        created_by: CREATED_BY,
        posted_by: status === 'POSTED' ? CREATED_BY : undefined,
        posted_at: status === 'POSTED' ? invoiceDate : undefined,
        cancelled_by: status === 'CANCELLED' ? CREATED_BY : undefined,
        cancelled_at: status === 'CANCELLED' ? addDays(invoiceDate, 1) : undefined,
        items: { create: lineData },
      },
    });

    if (paidAmount > 0) {
      await prisma.spPurchasePayment.create({
        data: {
          institute_id: instId,
          pi_id: invoice.pi_id,
          payment_date: addDays(invoiceDate, randInt(1, 10)),
          amount: paidAmount,
          mode: piIndex % 2 === 0 ? 'BANK_TRANSFER' : 'CHEQUE',
          reference_no: `PMT-REF-${pad(piIndex + 1, 4)}`,
          created_by: CREATED_BY,
        },
      });
    }
    piIndex++;
  }

  // 3 standalone purchase invoices with no PO/GRN link.
  for (let i = 0; i < 3; i++) {
    const monthIdx = i % MONTHS.length;
    const invoiceDate = dateInMonth(monthIdx, randInt(1, 25));
    const vendor = pick(vendors, i + 1);
    const lines = randomLines(randInt(1, 2));
    let subtotal = 0;
    let taxAmount = 0;
    const lineData = lines.map((l) => {
      const tax = itemTax(l.item_id);
      const calc = calcInvoiceLine(l.quantity, l.unit_price, 0, tax.cgst, tax.sgst, tax.igst);
      subtotal += calc.taxable_value;
      taxAmount += calc.cgst_amount + calc.sgst_amount + calc.igst_amount;
      return {
        item_id: l.item_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        cgst_rate: tax.cgst,
        sgst_rate: tax.sgst,
        igst_rate: tax.igst,
        cgst_amount: calc.cgst_amount,
        sgst_amount: calc.sgst_amount,
        igst_amount: calc.igst_amount,
        line_discount: 0,
        line_total: calc.line_total,
      };
    });
    const grandTotal = round2(subtotal + taxAmount);
    const invoice = await prisma.spPurchaseInvoice.create({
      data: {
        institute_id: instId,
        invoice_number: `PINV/SEED/26-27/${pad(piIndex + 1)}`,
        financial_year: FINANCIAL_YEAR,
        vendor_invoice_number: `VEND-DIRECT-${pad(piIndex + 1, 4)}`,
        vendor_id: vendor.vendor_id,
        invoice_date: invoiceDate,
        due_date: addDays(invoiceDate, 30),
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount: 0,
        grand_total: grandTotal,
        paid_amount: grandTotal,
        payment_status: 'PAID',
        status: 'POSTED',
        created_by: CREATED_BY,
        posted_by: CREATED_BY,
        posted_at: invoiceDate,
        items: { create: lineData },
      },
    });
    await prisma.spPurchasePayment.create({
      data: {
        institute_id: instId,
        pi_id: invoice.pi_id,
        payment_date: addDays(invoiceDate, 3),
        amount: grandTotal,
        mode: 'BANK_TRANSFER',
        created_by: CREATED_BY,
      },
    });
    piIndex++;
  }

  // ───────────────────────── SALES SIDE ─────────────────────────
  console.log('  (sales-purchase) seeding sales orders, invoices & receipts...');

  const SO_COUNT = 22;
  const soRecords: Array<{ so_id: number; customer_id: number; so_date: Date; items: Array<{ so_item_id: number; item_id: number; quantity: number; unit_price: number }> }> = [];

  const soStatusPlan = (i: number): 'CONFIRMED' | 'PARTIALLY_INVOICED' | 'CLOSED' | 'DRAFT' | 'CANCELLED' => {
    if (i === SO_COUNT - 1) return 'DRAFT';
    if (i === SO_COUNT - 2) return 'CANCELLED';
    if (i % 4 === 0) return 'PARTIALLY_INVOICED';
    if (i % 3 === 0) return 'CLOSED';
    return 'CONFIRMED';
  };

  for (let i = 0; i < SO_COUNT; i++) {
    const monthIdx = i % MONTHS.length;
    const soDate = dateInMonth(monthIdx, randInt(1, 25));
    const customer = pick(customers, i);
    const lines = randomLines(randInt(1, 3)).map((l) => ({ ...l, unit_price: items.find((it) => it.item_id === l.item_id)!.sales_price }));
    const status = soStatusPlan(i);

    let subtotal = 0;
    let taxAmount = 0;
    const lineData = lines.map((l) => {
      const tax = itemTax(l.item_id);
      const combinedPct = tax.cgst + tax.sgst + tax.igst;
      const calc = calcOrderLine(l.quantity, Number(l.unit_price), 0, combinedPct);
      subtotal += calc.line_subtotal;
      taxAmount += calc.line_tax_amount;
      return {
        item_id: l.item_id,
        quantity: l.quantity,
        unit_price: Number(l.unit_price),
        tax_code_id: tax.tax_code_id,
        line_discount: 0,
        line_tax_amount: calc.line_tax_amount,
        line_total: calc.line_total,
      };
    });
    const grandTotal = round2(subtotal + taxAmount);

    const so = await prisma.spSalesOrder.create({
      data: {
        institute_id: instId,
        so_number: `SO/SEED/26-27/${pad(i + 1)}`,
        financial_year: FINANCIAL_YEAR,
        customer_id: customer.customer_id,
        so_date: soDate,
        delivery_date: addDays(soDate, 10),
        status,
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount: 0,
        grand_total: grandTotal,
        created_by: CREATED_BY,
        confirmed_at: status === 'DRAFT' ? null : soDate,
        cancelled_by: status === 'CANCELLED' ? CREATED_BY : undefined,
        cancelled_at: status === 'CANCELLED' ? addDays(soDate, 1) : undefined,
        items: { create: lineData },
      },
      include: { items: true },
    });

    soRecords.push({
      so_id: so.so_id,
      customer_id: customer.customer_id,
      so_date: soDate,
      items: so.items.map((it) => ({ so_item_id: it.so_item_id, item_id: it.item_id, quantity: Number(it.quantity), unit_price: Number(it.unit_price) })),
    });
  }

  // Sales invoices against confirmed/partially-invoiced/closed SOs, plus 3 standalone.
  const invoiceableSos = soRecords.filter((_, i) => {
    const status = soStatusPlan(i);
    return status === 'CONFIRMED' || status === 'PARTIALLY_INVOICED' || status === 'CLOSED';
  });

  let siIndex = 0;
  for (let i = 0; i < invoiceableSos.length; i++) {
    const so = invoiceableSos[i];
    const invoiceDate = addDays(so.so_date, randInt(1, 5));
    const dueDate = addDays(invoiceDate, 15);
    const status: 'POSTED' | 'DRAFT' | 'CANCELLED' = i === invoiceableSos.length - 1 ? 'DRAFT' : i === invoiceableSos.length - 2 ? 'CANCELLED' : 'POSTED';

    let subtotal = 0;
    let taxAmount = 0;
    const lineData = so.items.map((it) => {
      const tax = itemTax(it.item_id);
      const calc = calcInvoiceLine(it.quantity, it.unit_price, 0, tax.cgst, tax.sgst, tax.igst);
      subtotal += calc.taxable_value;
      taxAmount += calc.cgst_amount + calc.sgst_amount + calc.igst_amount;
      return {
        so_item_id: it.so_item_id,
        item_id: it.item_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        cgst_rate: tax.cgst,
        sgst_rate: tax.sgst,
        igst_rate: tax.igst,
        cgst_amount: calc.cgst_amount,
        sgst_amount: calc.sgst_amount,
        igst_amount: calc.igst_amount,
        line_discount: 0,
        line_total: calc.line_total,
      };
    });
    const grandTotal = round2(subtotal + taxAmount);

    const mod = siIndex % 5;
    let paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' = 'PAID';
    let paidAmount = grandTotal;
    if (mod === 3) {
      paymentStatus = 'PARTIALLY_PAID';
      paidAmount = round2(grandTotal * (0.3 + Math.random() * 0.3));
    } else if (mod === 4) {
      paymentStatus = 'UNPAID';
      paidAmount = 0;
    }
    if (status !== 'POSTED') {
      paymentStatus = 'UNPAID';
      paidAmount = 0;
    }

    const invoice = await prisma.spSalesInvoice.create({
      data: {
        institute_id: instId,
        invoice_number: `${GUARD_PREFIX}/${pad(siIndex + 1)}`,
        financial_year: FINANCIAL_YEAR,
        customer_id: so.customer_id,
        sales_order_id: so.so_id,
        invoice_date: invoiceDate,
        due_date: dueDate,
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount: 0,
        grand_total: grandTotal,
        paid_amount: paidAmount,
        payment_status: paymentStatus,
        status,
        created_by: CREATED_BY,
        posted_by: status === 'POSTED' ? CREATED_BY : undefined,
        posted_at: status === 'POSTED' ? invoiceDate : undefined,
        cancelled_by: status === 'CANCELLED' ? CREATED_BY : undefined,
        cancelled_at: status === 'CANCELLED' ? addDays(invoiceDate, 1) : undefined,
        items: { create: lineData },
      },
    });

    if (paidAmount > 0) {
      await prisma.spSalesReceipt.create({
        data: {
          institute_id: instId,
          si_id: invoice.si_id,
          receipt_date: addDays(invoiceDate, randInt(1, 8)),
          amount: paidAmount,
          mode: siIndex % 2 === 0 ? 'UPI' : 'BANK_TRANSFER',
          reference_no: `RCT-REF-${pad(siIndex + 1, 4)}`,
          created_by: CREATED_BY,
        },
      });
    }
    siIndex++;
  }

  // 3 standalone sales invoices (no sales order link).
  for (let i = 0; i < 3; i++) {
    const monthIdx = i % MONTHS.length;
    const invoiceDate = dateInMonth(monthIdx, randInt(1, 25));
    const customer = pick(customers, i + 1);
    const lines = randomLines(randInt(1, 2)).map((l) => ({ ...l, unit_price: Number(items.find((it) => it.item_id === l.item_id)!.sales_price) }));
    let subtotal = 0;
    let taxAmount = 0;
    const lineData = lines.map((l) => {
      const tax = itemTax(l.item_id);
      const calc = calcInvoiceLine(l.quantity, l.unit_price, 0, tax.cgst, tax.sgst, tax.igst);
      subtotal += calc.taxable_value;
      taxAmount += calc.cgst_amount + calc.sgst_amount + calc.igst_amount;
      return {
        item_id: l.item_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        cgst_rate: tax.cgst,
        sgst_rate: tax.sgst,
        igst_rate: tax.igst,
        cgst_amount: calc.cgst_amount,
        sgst_amount: calc.sgst_amount,
        igst_amount: calc.igst_amount,
        line_discount: 0,
        line_total: calc.line_total,
      };
    });
    const grandTotal = round2(subtotal + taxAmount);
    const invoice = await prisma.spSalesInvoice.create({
      data: {
        institute_id: instId,
        invoice_number: `${GUARD_PREFIX}/${pad(siIndex + 1)}`,
        financial_year: FINANCIAL_YEAR,
        customer_id: customer.customer_id,
        invoice_date: invoiceDate,
        due_date: addDays(invoiceDate, 15),
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount: 0,
        grand_total: grandTotal,
        paid_amount: grandTotal,
        payment_status: 'PAID',
        status: 'POSTED',
        created_by: CREATED_BY,
        posted_by: CREATED_BY,
        posted_at: invoiceDate,
        items: { create: lineData },
      },
    });
    await prisma.spSalesReceipt.create({
      data: {
        institute_id: instId,
        si_id: invoice.si_id,
        receipt_date: addDays(invoiceDate, 2),
        amount: grandTotal,
        mode: 'CASH',
        created_by: CREATED_BY,
      },
    });
    siIndex++;
  }

  console.log(`  (sales-purchase) seeded ${poRecords.length + extraStatuses.length} POs, ${grnRecords.length} GRNs, ${piIndex} purchase invoices, ${soRecords.length} SOs, ${siIndex} sales invoices.`);
}
