import { PrismaClient, Prisma, CanteenMenuCategory, CanteenMenuItem, CanteenPosTerminal } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * Seeds ~6 months (2026-05-01 .. 2026-10-14, "today") of realistic Canteen
 * transactional data: menu categories/items, members+wallets, POS terminals,
 * POS shifts (opened/closed), orders+items+payments, and wallet
 * topups/transactions — so the Canteen dashboard (today's orders/revenue,
 * unpaid orders, active members, open shifts, wallet balance, top items,
 * sales/category/payment-mode breakdowns, shift report) and the main
 * dashboard's canteen summary are populated.
 *
 * Builds on prisma/seed.ts's demo category/item/member/wallet/terminal
 * (which are left untouched, un-scoped to any institute) by creating a
 * *new*, institute-scoped set of records.
 *
 * Safe to re-run: guarded by an early-return once enough orders already
 * exist for this institute.
 */

const TODAY = new Date(Date.UTC(2026, 9, 14)); // 2026-10-14
const RANGE_START = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const SEED_ORDER_THRESHOLD = 500;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function dateAtOffset(baseDate: Date, dayOffset: number, hour: number, minute: number): Date {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function seedCanteen(prisma: PrismaClient, instId: string): Promise<void> {
  console.log('--- Seeding Canteen Transactional Data (last ~6 months) ---');

  const existingOrders = await prisma.canteenOrder.count({ where: { instituteId: instId } });
  if (existingOrders >= SEED_ORDER_THRESHOLD) {
    console.log(`Canteen already has ${existingOrders} orders for ${instId} — skipping.`);
    return;
  }

  // ------------------------------------------------------------------
  // Categories & Menu Items
  // ------------------------------------------------------------------
  const categoryDefs: Array<{ name: string; displayOrder: number }> = [
    { name: 'Breakfast', displayOrder: 1 },
    { name: 'Lunch Meals', displayOrder: 2 },
    { name: 'Snacks', displayOrder: 3 },
    { name: 'Beverages', displayOrder: 4 },
    { name: 'Desserts', displayOrder: 5 },
  ];

  const categories: CanteenMenuCategory[] = [];
  for (const def of categoryDefs) {
    const cat = await prisma.canteenMenuCategory.upsert({
      where: { instituteId_name: { instituteId: instId, name: def.name } },
      update: { displayOrder: def.displayOrder },
      create: { instituteId: instId, name: def.name, displayOrder: def.displayOrder },
    });
    categories.push(cat);
  }
  const catByName = new Map(categories.map((c) => [c.name, c]));

  const itemDefs: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
    foodType: 'VEG' | 'NON_VEG' | 'EGG';
  }> = [
    { id: 'CANTEEN_ITEM_201', name: 'Masala Dosa', category: 'Breakfast', price: 45, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_202', name: 'Idli Sambar (2 pcs)', category: 'Breakfast', price: 35, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_203', name: 'Poha', category: 'Breakfast', price: 30, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_204', name: 'Veg Thali', category: 'Lunch Meals', price: 90, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_205', name: 'Chicken Biryani', category: 'Lunch Meals', price: 140, foodType: 'NON_VEG' },
    { id: 'CANTEEN_ITEM_206', name: 'Paneer Butter Masala + Rice', category: 'Lunch Meals', price: 110, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_207', name: 'Egg Fried Rice', category: 'Lunch Meals', price: 85, foodType: 'EGG' },
    { id: 'CANTEEN_ITEM_208', name: 'Samosa (2 pcs)', category: 'Snacks', price: 20, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_209', name: 'Veg Sandwich', category: 'Snacks', price: 40, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_210', name: 'Chicken Roll', category: 'Snacks', price: 70, foodType: 'NON_VEG' },
    { id: 'CANTEEN_ITEM_211', name: 'French Fries', category: 'Snacks', price: 50, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_212', name: 'Masala Chai', category: 'Beverages', price: 15, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_213', name: 'Filter Coffee', category: 'Beverages', price: 18, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_214', name: 'Fresh Lime Soda', category: 'Beverages', price: 25, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_215', name: 'Cold Coffee', category: 'Beverages', price: 45, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_216', name: 'Gulab Jamun (2 pcs)', category: 'Desserts', price: 30, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_217', name: 'Ice Cream Cup', category: 'Desserts', price: 40, foodType: 'VEG' },
    { id: 'CANTEEN_ITEM_218', name: 'Fruit Custard', category: 'Desserts', price: 35, foodType: 'VEG' },
  ];

  const items: CanteenMenuItem[] = [];
  for (const def of itemDefs) {
    const cat = catByName.get(def.category)!;
    const item = await prisma.canteenMenuItem.upsert({
      where: { id: def.id },
      update: { name: def.name, price: def.price, categoryId: cat.id, foodType: def.foodType, isAvailable: true },
      create: {
        id: def.id,
        instituteId: instId,
        categoryId: cat.id,
        name: def.name,
        description: `${def.name} — freshly prepared`,
        price: def.price,
        taxRate: 5.0,
        foodType: def.foodType,
        isAvailable: true,
      },
    });
    items.push(item);
  }

  // ------------------------------------------------------------------
  // Members & Wallets
  // ------------------------------------------------------------------
  const MEMBER_COUNT = 50;
  const firstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
    'Ananya', 'Diya', 'Isha', 'Kavya', 'Myra', 'Pari', 'Riya', 'Saanvi', 'Tara', 'Zara',
    'Karthik', 'Nikhil', 'Varun', 'Sanjay', 'Deepak', 'Priya', 'Neha', 'Divya', 'Sneha', 'Pooja',
    'Rahul', 'Akash', 'Manish', 'Suresh', 'Ramesh', 'Lakshmi', 'Meena', 'Geeta', 'Sunita', 'Anita',
    'Vikram', 'Harish', 'Naveen', 'Pradeep', 'Kiran', 'Latha', 'Shalini', 'Swathi', 'Vani', 'Usha',
  ];

  const members: Array<{ id: string; walletId: string }> = [];
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const memberType = i < 35 ? 'STUDENT' : 'STAFF';
    const barcode = `BC-${instId}-${2000 + i}`;
    const member = await prisma.canteenMember.upsert({
      where: { instituteId_idCardBarcode: { instituteId: instId, idCardBarcode: barcode } },
      update: { name: `${firstNames[i]} ${memberType === 'STUDENT' ? 'Student' : 'Staff'}` },
      create: {
        instituteId: instId,
        externalRefId: `${memberType === 'STUDENT' ? 'STU' : 'EMP'}-${2000 + i}`,
        name: `${firstNames[i]} ${memberType === 'STUDENT' ? 'Student' : 'Staff'}`,
        memberType,
        idCardBarcode: barcode,
      },
    });

    const wallet = await prisma.canteenWallet.upsert({
      where: { memberId: member.id },
      update: {},
      create: {
        instituteId: instId,
        memberId: member.id,
        balance: 0,
        status: 'ACTIVE',
        dailySpendLimit: 300.0,
      },
    });

    members.push({ id: member.id, walletId: wallet.id });
  }

  // ------------------------------------------------------------------
  // POS Terminals
  // ------------------------------------------------------------------
  const terminalDefs = [
    { name: 'Canteen Counter A', location: 'Main Canteen Ground Floor' },
    { name: 'Canteen Counter B', location: 'Main Canteen First Floor' },
  ];
  const terminals: CanteenPosTerminal[] = [];
  for (const def of terminalDefs) {
    const terminal = await prisma.canteenPosTerminal.upsert({
      where: { instituteId_name: { instituteId: instId, name: def.name } },
      update: { location: def.location },
      create: { instituteId: instId, name: def.name, location: def.location },
    });
    terminals.push(terminal);
  }

  const totalDays = daysBetween(RANGE_START, TODAY) + 1;

  // ------------------------------------------------------------------
  // POS Shifts — one per terminal per day; all closed except today's.
  // ------------------------------------------------------------------
  const shiftRows: Prisma.CanteenPosShiftCreateManyInput[] = [];
  const staffIds = ['usr_canteen_manager_demo', 'usr_canteen_counter_staff_demo'];

  for (let day = 0; day < totalDays; day++) {
    const isToday = day === totalDays - 1;
    for (const terminal of terminals) {
      const openingCash = randomInt(1000, 3000);
      const shiftStart = dateAtOffset(RANGE_START, day, 8, 0);
      if (isToday) {
        shiftRows.push({
          id: randomUUID(),
          instituteId: instId,
          terminalId: terminal.id,
          staffId: randomChoice(staffIds),
          openingCash,
          shiftStart,
          status: 'OPEN',
          createdAt: shiftStart,
          updatedAt: shiftStart,
        });
      } else {
        const shiftEnd = dateAtOffset(RANGE_START, day, 20, 0);
        const sales = randomInt(1500, 6000);
        const expectedCash = openingCash + sales;
        const variance = randomInt(-50, 50);
        const closingCash = expectedCash + variance;
        shiftRows.push({
          id: randomUUID(),
          instituteId: instId,
          terminalId: terminal.id,
          staffId: randomChoice(staffIds),
          openingCash,
          closingCash,
          expectedCash,
          variance,
          shiftStart,
          shiftEnd,
          status: 'CLOSED',
          createdAt: shiftStart,
          updatedAt: shiftEnd,
        });
      }
    }
  }
  await prisma.canteenPosShift.createMany({ data: shiftRows });

  // ------------------------------------------------------------------
  // Orders + Order Items + Payments
  // ------------------------------------------------------------------
  const PAYMENT_MODES: Array<'CASH' | 'CARD' | 'UPI' | 'WALLET'> = ['CASH', 'CARD', 'UPI', 'WALLET'];
  const orderRows: Prisma.CanteenOrderCreateManyInput[] = [];
  const orderItemRows: Prisma.CanteenOrderItemCreateManyInput[] = [];
  const paymentRows: Prisma.CanteenPaymentCreateManyInput[] = [];
  const walletTxnRows: Prisma.CanteenWalletTransactionCreateManyInput[] = [];

  // Running wallet balances, simulated chronologically alongside topups.
  const walletBalance = new Map<string, number>(members.map((m) => [m.walletId, 0]));
  const topupRows: Prisma.CanteenWalletTopupCreateManyInput[] = [];

  // Pre-generate a handful of topups per member, spread across the range,
  // then process orders day-by-day so wallet debits/credits stay chronological.
  type WalletEvent = { date: Date; kind: 'TOPUP' | 'ORDER'; amount: number; ref: () => string };
  const walletEventsByMember = new Map<string, WalletEvent[]>();
  for (const m of members) walletEventsByMember.set(m.id, []);

  for (const m of members) {
    const topupCount = randomInt(2, 5);
    for (let t = 0; t < topupCount; t++) {
      const day = randomInt(0, totalDays - 1);
      const date = dateAtOffset(RANGE_START, day, randomInt(9, 17), randomInt(0, 59));
      const amount = randomChoice([200, 300, 500, 1000]);
      const topupId = randomUUID();
      topupRows.push({
        id: topupId,
        instituteId: instId,
        walletId: members.find((x) => x.id === m.id)!.walletId,
        amount,
        paymentMode: randomChoice(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER']),
        transactionRef: `TOPUP-${topupId.slice(0, 8)}`,
        topupDate: date,
        approvedBy: 'usr_canteen_counter_staff_demo',
        status: 'SUCCESS',
        createdAt: date,
        updatedAt: date,
      });
      walletEventsByMember.get(m.id)!.push({ date, kind: 'TOPUP', amount, ref: () => topupId });
    }
  }

  let orderCounter = 1;
  for (let day = 0; day < totalDays; day++) {
    const orderDateBase = dateAtOffset(RANGE_START, day, 0, 0);
    const isToday = day === totalDays - 1;
    const ordersTodayCount = randomInt(6, 12);

    for (let o = 0; o < ordersTodayCount; o++) {
      const hour = randomInt(7, 19);
      const minute = randomInt(0, 59);
      const orderDateTime = dateAtOffset(RANGE_START, day, hour, minute);

      const lineCount = randomInt(1, 4);
      const chosenItems = Array.from({ length: lineCount }, () => randomChoice(items));

      let subtotal = 0;
      const lineInputs: Array<{ itemId: string; quantity: number; unitPrice: number; subtotal: number }> = [];
      for (const it of chosenItems) {
        const qty = randomInt(1, 3);
        const unitPrice = Number(it.price);
        const lineSubtotal = round2(unitPrice * qty);
        subtotal += lineSubtotal;
        lineInputs.push({ itemId: it.id, quantity: qty, unitPrice, subtotal: lineSubtotal });
      }
      subtotal = round2(subtotal);
      const taxAmount = round2(subtotal * 0.05);
      const isCancelled = Math.random() < 0.04;
      const discountAmount = Math.random() < 0.1 ? round2(subtotal * 0.1) : 0;
      const totalAmount = round2(subtotal + taxAmount - discountAmount);

      let status: 'PLACED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED' = 'COMPLETED';
      if (isCancelled) {
        status = 'CANCELLED';
      } else if (isToday && Math.random() < 0.3) {
        status = randomChoice(['PLACED', 'PREPARING', 'READY']);
      }

      const hasMember = Math.random() < 0.7;
      const member = hasMember ? randomChoice(members) : null;
      const terminal = randomChoice(terminals);
      const orderId = randomUUID();
      const orderNumber = `ORD-${orderDateBase.getUTCFullYear()}${String(orderDateBase.getUTCMonth() + 1).padStart(2, '0')}${String(orderDateBase.getUTCDate()).padStart(2, '0')}-${String(orderCounter++).padStart(5, '0')}`;

      let paymentMode = randomChoice(PAYMENT_MODES);
      if (paymentMode === 'WALLET' && !member) paymentMode = 'CASH';

      let paymentStatus: 'UNPAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' = 'PAID';
      if (status === 'CANCELLED') {
        paymentStatus = 'UNPAID';
      } else if (status === 'PLACED' || status === 'PREPARING') {
        paymentStatus = Math.random() < 0.5 ? 'UNPAID' : 'PAID';
      } else if (Math.random() < 0.03) {
        paymentStatus = 'REFUNDED';
      } else if (Math.random() < 0.03) {
        paymentStatus = 'PARTIALLY_REFUNDED';
      }

      orderRows.push({
        id: orderId,
        instituteId: instId,
        orderNumber,
        memberId: member?.id ?? null,
        terminalId: terminal.id,
        orderDate: orderDateTime,
        orderTime: orderDateTime,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        status,
        paymentStatus,
        createdBy: 'usr_canteen_counter_staff_demo',
        createdAt: orderDateTime,
        updatedAt: orderDateTime,
      });

      for (const line of lineInputs) {
        orderItemRows.push({
          id: randomUUID(),
          instituteId: instId,
          orderId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
        });
      }

      if (paymentStatus === 'PAID' || paymentStatus === 'PARTIALLY_REFUNDED' || paymentStatus === 'REFUNDED') {
        const canAffordWallet =
          paymentMode === 'WALLET' && member
            ? (walletBalance.get(members.find((x) => x.id === member.id)!.walletId) ?? 0) >= totalAmount
            : true;
        const actualMode = paymentMode === 'WALLET' && !canAffordWallet ? 'CASH' : paymentMode;

        const paymentId = randomUUID();
        paymentRows.push({
          id: paymentId,
          instituteId: instId,
          orderId,
          paymentMode: actualMode,
          amount: totalAmount,
          transactionRef: actualMode === 'CASH' ? null : `TXN-${paymentId.slice(0, 10)}`,
          status: 'success',
          paidAt: orderDateTime,
          receivedBy: 'usr_canteen_counter_staff_demo',
          createdAt: orderDateTime,
          updatedAt: orderDateTime,
        });

        if (actualMode === 'WALLET' && member) {
          walletEventsByMember.get(member.id)!.push({
            date: orderDateTime,
            kind: 'ORDER',
            amount: totalAmount,
            ref: () => orderId,
          });
        }
      }
    }
  }

  await prisma.canteenOrder.createMany({ data: orderRows });
  for (let i = 0; i < orderItemRows.length; i += 1000) {
    await prisma.canteenOrderItem.createMany({ data: orderItemRows.slice(i, i + 1000) });
  }
  await prisma.canteenPayment.createMany({ data: paymentRows });
  await prisma.canteenWalletTopup.createMany({ data: topupRows });

  // ------------------------------------------------------------------
  // Replay wallet events chronologically per member to build consistent
  // wallet_transactions + final wallet balances.
  // ------------------------------------------------------------------
  for (const m of members) {
    const walletId = members.find((x) => x.id === m.id)!.walletId;
    const events = walletEventsByMember.get(m.id)!.sort((a, b) => a.date.getTime() - b.date.getTime());
    let balance = 0;
    for (const ev of events) {
      if (ev.kind === 'TOPUP') {
        balance = round2(balance + ev.amount);
        walletTxnRows.push({
          id: randomUUID(),
          instituteId: instId,
          walletId,
          type: 'CREDIT',
          amount: ev.amount,
          referenceType: 'TOPUP',
          referenceId: ev.ref(),
          balanceAfter: balance,
          transactedAt: ev.date,
          createdBy: 'usr_canteen_counter_staff_demo',
        });
      } else {
        balance = round2(balance - ev.amount);
        walletTxnRows.push({
          id: randomUUID(),
          instituteId: instId,
          walletId,
          type: 'DEBIT',
          amount: ev.amount,
          referenceType: 'ORDER_PAYMENT',
          referenceId: ev.ref(),
          balanceAfter: balance,
          transactedAt: ev.date,
          createdBy: 'usr_canteen_counter_staff_demo',
        });
      }
    }
    walletBalance.set(walletId, balance);
  }

  await prisma.canteenWalletTransaction.createMany({ data: walletTxnRows });

  for (const m of members) {
    const walletId = members.find((x) => x.id === m.id)!.walletId;
    await prisma.canteenWallet.update({
      where: { id: walletId },
      data: { balance: walletBalance.get(walletId) ?? 0 },
    });
  }

  console.log(
    `Canteen seeded: ${categories.length} categories, ${items.length} items, ${members.length} members/wallets, ` +
      `${terminals.length} terminals, ${shiftRows.length} shifts, ${orderRows.length} orders, ` +
      `${orderItemRows.length} order items, ${paymentRows.length} payments, ${topupRows.length} topups, ` +
      `${walletTxnRows.length} wallet transactions (${RANGE_START.toISOString().slice(0, 10)} .. ${TODAY.toISOString().slice(0, 10)}).`,
  );
}
