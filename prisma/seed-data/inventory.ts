import { PrismaClient } from '@prisma/client';

/**
 * Transactional demo data for the Inventory module dashboard
 * (src/inventory/dashboard/dashboard.service.ts), spanning the last ~6
 * months (May 2026 - Oct 2026, institute "today" = 2026-10-14).
 *
 * Unlike Sales & Purchase and Accounts, prisma/seed.ts creates NO Inventory
 * masters at all, so this file also creates the minimal masters it needs
 * (categories, a location, a vendor, items, holders) before layering
 * transactional data on top — all tagged with deterministic natural keys
 * so the whole function is safe to re-run.
 *
 * Mirrors the dashboard's own aggregates:
 *  - total_items / low_stock_items (inv_stock_balances vs reorder_level)
 *  - stock_by_location (InvStockBalance groupBy location)
 *  - todays_issues / overdue_returns (InvAssetIssue by issue_date / expected_return_date)
 *  - assets.by_status (InvAssetUnit groupBy status: issued / in_store / under_repair)
 *  - category_wise_consumption (issues joined to items/categories)
 *  - vendor_wise_purchases (InvStockPurchase groupBy vendor, date-ranged)
 *  - stock_valuation (balance * latest purchase unit_price)
 *
 * Note: unit prices/quantities use plain JS numbers (matches the lighter
 * convention already used by Inventory's own purchases service, unlike
 * Sales & Purchase's Prisma.Decimal-based money.util).
 */

const CREATED_BY = 'usr_inventory_admin_demo';
const ASSET_TAG_PREFIX = 'AST/SEED/';
const GUARD_THRESHOLD = 20;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pad(n: number, width = 5): string {
  return String(n).padStart(width, '0');
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
  return new Date(Date.UTC(m.year, m.month - 1, Math.min(day, m.maxDay)));
}

function addDays(d: Date, days: number): Date {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + days);
  return nd;
}

export async function seedInventory(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.invStockPurchase.count({ where: { institute_id: instId } });
  if (existing >= GUARD_THRESHOLD) {
    console.log(`  (inventory) already has ${existing} seeded stock purchases — skipping`);
    return;
  }

  // ───────────────────────── MASTERS (none exist yet for Inventory) ─────────────────────────
  console.log('  (inventory) seeding minimal masters (categories, location, vendor, items, holders)...');

  const categoryDefs = ['IT Equipment', 'Lab Equipment', 'Furniture & Fixtures', 'Sports Equipment', 'Stationery'];
  const categoryByName = new Map<string, number>();
  for (const name of categoryDefs) {
    let cat = await prisma.invCategory.findFirst({ where: { institute_id: instId, name } });
    if (!cat) cat = await prisma.invCategory.create({ data: { institute_id: instId, name } });
    categoryByName.set(name, cat.category_id);
  }

  const locationDefs: Array<{ name: string; type: 'store' | 'department' | 'classroom' | 'lab' }> = [
    { name: 'Main Store', type: 'store' },
    { name: 'Science Lab', type: 'lab' },
    { name: 'Admin Block', type: 'department' },
    { name: 'Classroom Block A', type: 'classroom' },
  ];
  const locationByName = new Map<string, number>();
  for (const l of locationDefs) {
    let loc = await prisma.invLocation.findFirst({ where: { institute_id: instId, name: l.name } });
    if (!loc) loc = await prisma.invLocation.create({ data: { institute_id: instId, name: l.name, type: l.type } });
    locationByName.set(l.name, loc.location_id);
  }

  const vendorDefs = [
    { name: 'TechSupply Co.', contact_phone: '9811111111', email: 'sales@techsupply.example' },
    { name: 'CampusMart Distributors', contact_phone: '9822222222', email: 'orders@campusmart.example' },
  ];
  const vendorByName = new Map<string, number>();
  for (const v of vendorDefs) {
    let vendor = await prisma.invVendor.findFirst({ where: { institute_id: instId, name: v.name } });
    if (!vendor) vendor = await prisma.invVendor.create({ data: { institute_id: instId, name: v.name, contact_phone: v.contact_phone, email: v.email } });
    vendorByName.set(v.name, vendor.vendor_id);
  }

  const itemDefs: Array<{ code: string; name: string; category: string; item_type: 'consumable' | 'asset'; uom: string; reorder_level: number }> = [
    { code: 'INV/SEED/00001', name: 'Desktop Computer', category: 'IT Equipment', item_type: 'asset', uom: 'pc', reorder_level: 5 },
    { code: 'INV/SEED/00002', name: 'Projector', category: 'IT Equipment', item_type: 'asset', uom: 'pc', reorder_level: 2 },
    { code: 'INV/SEED/00003', name: 'Microscope', category: 'Lab Equipment', item_type: 'asset', uom: 'pc', reorder_level: 3 },
    { code: 'INV/SEED/00004', name: 'Lab Beaker Set', category: 'Lab Equipment', item_type: 'consumable', uom: 'set', reorder_level: 10 },
    { code: 'INV/SEED/00005', name: 'Classroom Desk', category: 'Furniture & Fixtures', item_type: 'asset', uom: 'pc', reorder_level: 10 },
    { code: 'INV/SEED/00006', name: 'Whiteboard Marker', category: 'Stationery', item_type: 'consumable', uom: 'box', reorder_level: 20 },
    { code: 'INV/SEED/00007', name: 'Football', category: 'Sports Equipment', item_type: 'consumable', uom: 'pc', reorder_level: 6 },
    { code: 'INV/SEED/00008', name: 'A4 Paper Ream', category: 'Stationery', item_type: 'consumable', uom: 'ream', reorder_level: 30 },
  ];
  const itemByCode = new Map<string, { item_id: number; item_type: string; reorder_level: number }>();
  for (const i of itemDefs) {
    let item = await prisma.invItem.findFirst({ where: { institute_id: instId, item_code: i.code } });
    if (!item) {
      item = await prisma.invItem.create({
        data: {
          institute_id: instId,
          item_code: i.code,
          name: i.name,
          category_id: categoryByName.get(i.category)!,
          item_type: i.item_type,
          unit_of_measure: i.uom,
          reorder_level: i.reorder_level,
        },
      });
    }
    itemByCode.set(i.code, { item_id: item.item_id, item_type: item.item_type, reorder_level: item.reorder_level });
  }

  const holderDefs: Array<{ type: 'staff' | 'student' | 'department'; name: string }> = [
    { type: 'staff', name: 'Mrs. Anjali Rao (Staff)' },
    { type: 'staff', name: 'Mr. Vikram Shah (Staff)' },
    { type: 'department', name: 'Science Department' },
    { type: 'department', name: 'Administration Department' },
    { type: 'student', name: 'Student Council' },
  ];
  const holders: Array<{ holder_id: number }> = [];
  for (const h of holderDefs) {
    let holder = await prisma.invHolder.findFirst({ where: { institute_id: instId, name: h.name } });
    if (!holder) holder = await prisma.invHolder.create({ data: { institute_id: instId, holder_type: h.type, name: h.name } });
    holders.push({ holder_id: holder.holder_id });
  }

  const unitPriceByCode: Record<string, number> = {
    'INV/SEED/00001': 42000,
    'INV/SEED/00002': 38000,
    'INV/SEED/00003': 15000,
    'INV/SEED/00004': 1200,
    'INV/SEED/00005': 3200,
    'INV/SEED/00006': 450,
    'INV/SEED/00007': 900,
    'INV/SEED/00008': 260,
  };

  const mainStoreId = locationByName.get('Main Store')!;
  const otherLocationIds = [...locationByName.values()].filter((id) => id !== mainStoreId);
  const vendorIds = [...vendorByName.values()];
  const itemCodes = [...itemByCode.keys()];

  // ───────────────────────── STOCK PURCHASES (feeds stock_by_location, vendor_wise_purchases, valuation) ─────────────────────────
  console.log('  (inventory) seeding stock purchases, transfers, adjustments & stock balances...');

  const PURCHASE_COUNT = 24;
  // Running balance per (item, location), rebuilt from the ledger as we go.
  const balances = new Map<string, number>(); // key `${item_id}:${location_id}` -> quantity

  function balKey(itemId: number, locationId: number) {
    return `${itemId}:${locationId}`;
  }
  function addBalance(itemId: number, locationId: number, delta: number) {
    const key = balKey(itemId, locationId);
    balances.set(key, (balances.get(key) ?? 0) + delta);
  }

  let purchaseIdx = 0;
  for (let i = 0; i < PURCHASE_COUNT; i++) {
    const monthIdx = i % MONTHS.length;
    const purchaseDate = dateInMonth(monthIdx, randInt(1, 25));
    const code = itemCodes[i % itemCodes.length];
    const item = itemByCode.get(code)!;
    const vendorId = vendorIds[i % vendorIds.length];
    const quantity = item.item_type === 'asset' ? randInt(1, 4) : randInt(10, 60);
    const unitPrice = unitPriceByCode[code];
    const totalAmount = round2(quantity * unitPrice);

    const purchase = await prisma.invStockPurchase.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        vendor_id: vendorId,
        location_id: mainStoreId,
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        invoice_number: `INVVENDOR/SEED/${pad(i + 1, 4)}`,
        purchase_date: purchaseDate,
        created_by: CREATED_BY,
      },
    });
    addBalance(item.item_id, mainStoreId, quantity);

    await prisma.invStockLedger.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        location_id: mainStoreId,
        transaction_type: 'purchase_in',
        quantity,
        balance_after: balances.get(balKey(item.item_id, mainStoreId))!,
        reference_type: 'purchase',
        reference_id: purchase.purchase_id,
        purchase_id: purchase.purchase_id,
        created_by: CREATED_BY,
        created_at: purchaseDate,
      },
    });

    // For asset-type items, create individual asset units against this purchase.
    if (item.item_type === 'asset') {
      for (let u = 0; u < quantity; u++) {
        purchaseIdx++;
        await prisma.invAssetUnit.create({
          data: {
            institute_id: instId,
            item_id: item.item_id,
            asset_tag: `${ASSET_TAG_PREFIX}${pad(purchaseIdx, 4)}`,
            serial_number: `SN-${pad(purchaseIdx, 6)}`,
            purchase_id: purchase.purchase_id,
            current_location_id: mainStoreId,
            status: 'in_store',
            purchase_date: purchaseDate,
            warranty_expiry: addDays(purchaseDate, 365),
          },
        });
      }
    }
  }

  // A handful of transfers out of the main store to other locations (consumables), moving stock around.
  const TRANSFER_COUNT = 10;
  for (let i = 0; i < TRANSFER_COUNT; i++) {
    const monthIdx = i % MONTHS.length;
    const transferDate = dateInMonth(monthIdx, randInt(1, 25));
    const code = itemCodes[(i + 2) % itemCodes.length];
    const item = itemByCode.get(code)!;
    if (item.item_type !== 'consumable') continue;
    const toLocation = otherLocationIds[i % otherLocationIds.length];
    const available = balances.get(balKey(item.item_id, mainStoreId)) ?? 0;
    const quantity = Math.min(randInt(2, 8), Math.max(available, 1));
    if (quantity <= 0) continue;

    const transfer = await prisma.invStockTransfer.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        from_location_id: mainStoreId,
        to_location_id: toLocation,
        quantity,
        transfer_date: transferDate,
        created_by: CREATED_BY,
      },
    });
    addBalance(item.item_id, mainStoreId, -quantity);
    addBalance(item.item_id, toLocation, quantity);

    await prisma.invStockLedger.createMany({
      data: [
        {
          institute_id: instId,
          item_id: item.item_id,
          location_id: mainStoreId,
          transaction_type: 'transfer_out',
          quantity,
          balance_after: balances.get(balKey(item.item_id, mainStoreId))!,
          reference_type: 'transfer',
          reference_id: transfer.transfer_id,
          transfer_id: transfer.transfer_id,
          created_by: CREATED_BY,
          created_at: transferDate,
        },
        {
          institute_id: instId,
          item_id: item.item_id,
          location_id: toLocation,
          transaction_type: 'transfer_in',
          quantity,
          balance_after: balances.get(balKey(item.item_id, toLocation))!,
          reference_type: 'transfer',
          reference_id: transfer.transfer_id,
          transfer_id: transfer.transfer_id,
          created_by: CREATED_BY,
          created_at: transferDate,
        },
      ],
    });
  }

  // A few damage/loss adjustments (negative) to make the low-stock dashboard figure non-trivial.
  const ADJUSTMENT_COUNT = 6;
  const adjustmentReasons: Array<'damaged' | 'expired' | 'lost' | 'audit_correction'> = ['damaged', 'lost', 'audit_correction', 'damaged', 'expired', 'audit_correction'];
  for (let i = 0; i < ADJUSTMENT_COUNT; i++) {
    const monthIdx = i % MONTHS.length;
    const adjDate = dateInMonth(monthIdx, randInt(1, 25));
    const code = itemCodes[(i + 4) % itemCodes.length];
    const item = itemByCode.get(code)!;
    const reason = adjustmentReasons[i];
    const available = balances.get(balKey(item.item_id, mainStoreId)) ?? 0;
    const delta = reason === 'audit_correction' ? randInt(1, 5) : -Math.min(randInt(1, 5), Math.max(available, 0));
    if (delta === 0) continue;

    const adjustment = await prisma.invStockAdjustment.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        location_id: mainStoreId,
        quantity_delta: delta,
        reason,
        remarks: `Seeded ${reason} adjustment`,
        created_by: CREATED_BY,
        created_at: adjDate,
      },
    });
    addBalance(item.item_id, mainStoreId, delta);

    await prisma.invStockLedger.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        location_id: mainStoreId,
        transaction_type: delta > 0 ? 'adjustment_in' : 'adjustment_out',
        quantity: Math.abs(delta),
        balance_after: balances.get(balKey(item.item_id, mainStoreId))!,
        reference_type: 'adjustment',
        reference_id: adjustment.adjustment_id,
        adjustment_id: adjustment.adjustment_id,
        created_by: CREATED_BY,
        created_at: adjDate,
      },
    });
  }

  // Persist the final running balances to inv_stock_balances.
  for (const [key, quantity] of balances) {
    const [itemIdStr, locationIdStr] = key.split(':');
    const item_id = Number(itemIdStr);
    const location_id = Number(locationIdStr);
    await prisma.invStockBalance.upsert({
      where: { item_id_location_id: { item_id, location_id } },
      update: { quantity: Math.max(quantity, 0), institute_id: instId },
      create: { item_id, location_id, institute_id: instId, quantity: Math.max(quantity, 0) },
    });
  }

  // ───────────────────────── ASSET ISSUES & RETURNS (feeds assets.by_status, category_wise_consumption, todays_issues, overdue_returns) ─────────────────────────
  console.log('  (inventory) seeding asset issues & returns...');

  const allAssetUnits = await prisma.invAssetUnit.findMany({ where: { institute_id: instId, asset_tag: { startsWith: ASSET_TAG_PREFIX } } });
  const ISSUE_COUNT = Math.min(18, allAssetUnits.length);

  // Leave the last couple of asset units in_store (idle) and send one to under_repair; issue the rest.
  for (let i = 0; i < ISSUE_COUNT; i++) {
    const unit = allAssetUnits[i];
    const monthIdx = i % MONTHS.length;
    const issueDate = dateInMonth(monthIdx, randInt(1, 25));
    const holder = holders[i % holders.length];
    const sourceLocation = mainStoreId;

    // Vary outcome: returned (good), still issued, overdue (expected date in the past, not yet returned).
    const outcome = i % 4; // 0: returned, 1: still issued (not yet due), 2: overdue, 3: returned damaged -> under_repair
    const expectedReturn = addDays(issueDate, outcome === 1 ? 60 : 20);

    const issue = await prisma.invAssetIssue.create({
      data: {
        institute_id: instId,
        item_id: unit.item_id,
        asset_unit_id: unit.asset_unit_id,
        quantity: 1,
        quantity_returned: outcome === 0 || outcome === 3 ? 1 : 0,
        holder_id: holder.holder_id,
        source_location_id: sourceLocation,
        issue_date: issueDate,
        expected_return_date: expectedReturn,
        status: outcome === 0 ? 'returned' : outcome === 3 ? 'returned' : outcome === 2 ? 'overdue' : 'issued',
        approval_status: 'not_required',
        issued_by: CREATED_BY,
      },
    });

    await prisma.invStockLedger.create({
      data: {
        institute_id: instId,
        item_id: unit.item_id,
        location_id: sourceLocation,
        transaction_type: 'issue_out',
        quantity: 1,
        balance_after: 0,
        reference_type: 'issue',
        reference_id: issue.issue_id,
        issue_id: issue.issue_id,
        created_by: CREATED_BY,
        created_at: issueDate,
      },
    });

    if (outcome === 0 || outcome === 3) {
      const returnDate = addDays(issueDate, randInt(15, 45));
      const ret = await prisma.invAssetReturn.create({
        data: {
          institute_id: instId,
          issue_id: issue.issue_id,
          quantity_returned: 1,
          condition: outcome === 3 ? 'damaged' : 'good',
          return_date: returnDate,
          received_by: CREATED_BY,
        },
      });
      await prisma.invStockLedger.create({
        data: {
          institute_id: instId,
          item_id: unit.item_id,
          location_id: sourceLocation,
          transaction_type: 'return_in',
          quantity: 1,
          balance_after: 0,
          reference_type: 'return',
          reference_id: ret.return_id,
          return_id: ret.return_id,
          created_by: CREATED_BY,
          created_at: returnDate,
        },
      });
      await prisma.invAssetUnit.update({
        where: { asset_unit_id: unit.asset_unit_id },
        data: {
          status: outcome === 3 ? 'under_repair' : 'in_store',
          current_location_id: sourceLocation,
          current_holder_id: null,
        },
      });
      if (outcome === 3) {
        await prisma.invAssetMaintenance.create({
          data: {
            institute_id: instId,
            asset_unit_id: unit.asset_unit_id,
            issue_reported: 'Returned damaged after issue — needs servicing',
            service_date: addDays(returnDate, 3),
            cost: round2(randInt(500, 3000)),
            status: 'reported',
            created_by: CREATED_BY,
          },
        });
      }
    } else {
      // Still issued (outcome 1 or 2 / overdue) — update the asset unit accordingly.
      await prisma.invAssetUnit.update({
        where: { asset_unit_id: unit.asset_unit_id },
        data: { status: 'issued', current_holder_id: holder.holder_id, current_location_id: null },
      });
    }
  }

  // A "today" issue so the todays_issues KPI is non-zero when seeded on the institute's "today".
  if (allAssetUnits.length > ISSUE_COUNT) {
    const todayUnit = allAssetUnits[ISSUE_COUNT];
    const today = new Date();
    const issue = await prisma.invAssetIssue.create({
      data: {
        institute_id: instId,
        item_id: todayUnit.item_id,
        asset_unit_id: todayUnit.asset_unit_id,
        quantity: 1,
        holder_id: holders[0].holder_id,
        source_location_id: mainStoreId,
        issue_date: today,
        expected_return_date: addDays(today, 30),
        status: 'issued',
        approval_status: 'not_required',
        issued_by: CREATED_BY,
      },
    });
    await prisma.invStockLedger.create({
      data: {
        institute_id: instId,
        item_id: todayUnit.item_id,
        location_id: mainStoreId,
        transaction_type: 'issue_out',
        quantity: 1,
        balance_after: 0,
        reference_type: 'issue',
        reference_id: issue.issue_id,
        issue_id: issue.issue_id,
        created_by: CREATED_BY,
        created_at: today,
      },
    });
    await prisma.invAssetUnit.update({
      where: { asset_unit_id: todayUnit.asset_unit_id },
      data: { status: 'issued', current_holder_id: holders[0].holder_id, current_location_id: null },
    });
  }

  // Consumable-item issues too, so category_wise_consumption has more than just asset categories.
  const consumableCodes = itemDefs.filter((i) => i.item_type === 'consumable').map((i) => i.code);
  const CONSUMABLE_ISSUE_COUNT = 10;
  for (let i = 0; i < CONSUMABLE_ISSUE_COUNT; i++) {
    const monthIdx = i % MONTHS.length;
    const issueDate = dateInMonth(monthIdx, randInt(1, 25));
    const code = consumableCodes[i % consumableCodes.length];
    const item = itemByCode.get(code)!;
    const holder = holders[(i + 1) % holders.length];
    const quantity = randInt(1, 5);

    const issue = await prisma.invAssetIssue.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        quantity,
        quantity_returned: 0,
        holder_id: holder.holder_id,
        source_location_id: mainStoreId,
        issue_date: issueDate,
        status: 'issued',
        approval_status: 'not_required',
        issued_by: CREATED_BY,
      },
    });
    addBalance(item.item_id, mainStoreId, -quantity);
    await prisma.invStockLedger.create({
      data: {
        institute_id: instId,
        item_id: item.item_id,
        location_id: mainStoreId,
        transaction_type: 'issue_out',
        quantity,
        balance_after: Math.max(balances.get(balKey(item.item_id, mainStoreId)) ?? 0, 0),
        reference_type: 'issue',
        reference_id: issue.issue_id,
        issue_id: issue.issue_id,
        created_by: CREATED_BY,
        created_at: issueDate,
      },
    });
  }

  // Re-persist balances after the consumable issues reduced some quantities.
  for (const [key, quantity] of balances) {
    const [itemIdStr, locationIdStr] = key.split(':');
    const item_id = Number(itemIdStr);
    const location_id = Number(locationIdStr);
    await prisma.invStockBalance.upsert({
      where: { item_id_location_id: { item_id, location_id } },
      update: { quantity: Math.max(quantity, 0), institute_id: instId },
      create: { item_id, location_id, institute_id: instId, quantity: Math.max(quantity, 0) },
    });
  }

  console.log(`  (inventory) seeded ${PURCHASE_COUNT} purchases, ${TRANSFER_COUNT} transfers, ${ADJUSTMENT_COUNT} adjustments, ${purchaseIdx} asset units, ${ISSUE_COUNT + CONSUMABLE_ISSUE_COUNT + 1} issues.`);
}
