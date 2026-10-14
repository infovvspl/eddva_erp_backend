import { PrismaClient } from '@prisma/client';

/**
 * Transactional demo data for the Accounts module dashboards
 * (src/accounts/dashboard/dashboard.service.ts and
 * accounts-dashboard.service.ts), spanning the last ~6 months
 * (May 2026 - Oct 2026, institute "today" = 2026-10-14).
 *
 * Builds on masters from prisma/seed.ts for institute_id 'INST_DEMO_101':
 * VoucherTypes JOURNAL/PAYMENT/RECEIPT/CONTRA, FinancialYear '2026-27',
 * and LedgerAccounts CASH-001/BANK-001/AR-001/AP-001/CAP-001/INC-001/
 * EXP-001/EXP-002.
 *
 * Posts real balanced double-entry vouchers (mirroring
 * src/accounts/vouchers/vouchers.service.ts: every voucher has >= 1 debit
 * and >= 1 credit entry, and totalDebit === totalCredit) so the ledger and
 * cash/bank-book dashboards have real movement, not just masters.
 *
 * Voucher numbering follows the same `${prefix}${seq.padStart(5,'0')}`
 * convention as VouchersService.nextVoucherNumber, continuing from
 * whatever VoucherNumberSequence already holds for each
 * (voucherTypeId, fyId) pair and writing the advanced sequence back at the
 * end, so a real voucher created later through the API never collides with
 * a seeded number.
 *
 * Safe to re-run: guarded by a count of vouchers tagged
 * sourceModule = 'SEED_DEMO' for this institute.
 */

const CREATED_BY = 'usr_accountant_demo';
const SOURCE_MODULE = 'SEED_DEMO';
const GUARD_THRESHOLD = 40;

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

interface Entry {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  narration?: string;
}

export async function seedAccounts(prisma: PrismaClient, instId: string): Promise<void> {
  const existing = await prisma.voucher.count({ where: { instituteId: instId, sourceModule: SOURCE_MODULE } });
  if (existing >= GUARD_THRESHOLD) {
    console.log(`  (accounts) already has ${existing} seeded vouchers — skipping`);
    return;
  }

  const fy = await prisma.financialYear.findFirst({ where: { instituteId: instId, fyLabel: '2026-27' } });
  if (!fy) {
    console.warn('  (accounts) financial year 2026-27 not found — run prisma/seed.ts first. Skipping.');
    return;
  }
  const fyId = fy.id;

  const voucherTypes = await prisma.voucherType.findMany({ where: { code: { in: ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'] } } });
  const typeByCode = new Map(voucherTypes.map((t) => [t.code, t]));
  const journalType = typeByCode.get('JOURNAL');
  const paymentType = typeByCode.get('PAYMENT');
  const receiptType = typeByCode.get('RECEIPT');
  const contraType = typeByCode.get('CONTRA');
  if (!journalType || !paymentType || !receiptType || !contraType) {
    console.warn('  (accounts) voucher types not found — run prisma/seed.ts first. Skipping.');
    return;
  }

  const ledgerAccounts = await prisma.ledgerAccount.findMany({
    where: { instituteId: instId, accountCode: { in: ['CASH-001', 'BANK-001', 'AR-001', 'AP-001', 'CAP-001', 'INC-001', 'EXP-001', 'EXP-002'] } },
  });
  const acc = new Map(ledgerAccounts.map((a) => [a.accountCode, a.id]));
  const requiredCodes = ['CASH-001', 'BANK-001', 'AR-001', 'AP-001', 'INC-001', 'EXP-001', 'EXP-002'];
  if (requiredCodes.some((c) => !acc.has(c))) {
    console.warn('  (accounts) one or more chart-of-accounts ledger accounts not found — run prisma/seed.ts first. Skipping.');
    return;
  }

  // ───────────────────────── voucher numbering sequences ─────────────────────────
  const seqState = new Map<string, { current: number; prefix: string; typeId: string }>();
  for (const vt of voucherTypes) {
    const seq = await prisma.voucherNumberSequence.findUnique({ where: { voucherTypeId_fyId: { voucherTypeId: vt.id, fyId } } });
    seqState.set(vt.code, { current: seq?.currentNumber ?? 0, prefix: vt.prefix, typeId: vt.id });
  }

  function nextVoucherNumber(code: string): string {
    const state = seqState.get(code)!;
    state.current += 1;
    return `${state.prefix}${pad(state.current, 5)}`;
  }

  let refCounter = 0;
  async function postVoucher(params: {
    typeCode: string;
    voucherDate: Date;
    narration: string;
    entries: Entry[];
    status?: 'DRAFT' | 'POSTED' | 'CANCELLED';
  }) {
    const { typeCode, voucherDate, narration, entries } = params;
    const status = params.status ?? 'POSTED';
    const vt = typeByCode.get(typeCode)!;
    const totalDebit = round2(entries.reduce((s, e) => s + e.debitAmount, 0));
    const totalCredit = round2(entries.reduce((s, e) => s + e.creditAmount, 0));
    refCounter += 1;

    await prisma.voucher.create({
      data: {
        instituteId: instId,
        voucherNumber: nextVoucherNumber(typeCode),
        voucherTypeId: vt.id,
        fyId,
        voucherDate,
        narration,
        totalDebit,
        totalCredit,
        status,
        isAutoPosted: true,
        sourceModule: SOURCE_MODULE,
        sourceReferenceId: `SEED-${typeCode}-${pad(refCounter, 5)}`,
        createdBy: CREATED_BY,
        approvedBy: status === 'POSTED' ? CREATED_BY : undefined,
        postedAt: status === 'POSTED' ? voucherDate : undefined,
        cancelledBy: status === 'CANCELLED' ? CREATED_BY : undefined,
        cancelledAt: status === 'CANCELLED' ? voucherDate : undefined,
        entries: {
          create: entries.map((e) => ({
            accountId: e.accountId,
            debitAmount: e.debitAmount,
            creditAmount: e.creditAmount,
            narration: e.narration ?? narration,
            voucherDate,
          })),
        },
      },
    });
  }

  console.log('  (accounts) posting journal/payment/receipt/contra vouchers across May-Oct 2026...');

  let postedCount = 0;
  for (let m = 0; m < MONTHS.length; m++) {
    // 1-2 sales-recognition journals (AR up, Income up) — feeds income trend.
    for (let k = 0; k < 2; k++) {
      const amount = round2(randInt(8000, 85000));
      await postVoucher({
        typeCode: 'JOURNAL',
        voucherDate: dateInMonth(m, randInt(2, 10) + k * 8),
        narration: `Seed: Sales invoice recognized (batch ${m + 1}-${k + 1})`,
        entries: [
          { accountId: acc.get('AR-001')!, debitAmount: amount, creditAmount: 0 },
          { accountId: acc.get('INC-001')!, debitAmount: 0, creditAmount: amount },
        ],
      });
      postedCount++;
    }

    // 1-2 purchase-recognition journals (Expense up, AP up).
    for (let k = 0; k < 2; k++) {
      const amount = round2(randInt(6000, 60000));
      await postVoucher({
        typeCode: 'JOURNAL',
        voucherDate: dateInMonth(m, randInt(3, 12) + k * 8),
        narration: `Seed: Purchase invoice recognized (batch ${m + 1}-${k + 1})`,
        entries: [
          { accountId: acc.get('EXP-001')!, debitAmount: amount, creditAmount: 0 },
          { accountId: acc.get('AP-001')!, debitAmount: 0, creditAmount: amount },
        ],
      });
      postedCount++;
    }

    // 1 office-expense journal paid directly from cash or bank.
    {
      const amount = round2(randInt(1200, 18000));
      const payFrom = m % 2 === 0 ? 'CASH-001' : 'BANK-001';
      await postVoucher({
        typeCode: 'JOURNAL',
        voucherDate: dateInMonth(m, randInt(14, 20)),
        narration: `Seed: Office expenses paid (${MONTHS[m].month}/${MONTHS[m].year})`,
        entries: [
          { accountId: acc.get('EXP-002')!, debitAmount: amount, creditAmount: 0 },
          { accountId: acc.get(payFrom)!, debitAmount: 0, creditAmount: amount },
        ],
      });
      postedCount++;
    }

    // 2 customer receipts (AR collected into cash/bank).
    for (let k = 0; k < 2; k++) {
      const amount = round2(randInt(5000, 60000));
      const intoAccount = k % 2 === 0 ? 'BANK-001' : 'CASH-001';
      await postVoucher({
        typeCode: 'RECEIPT',
        voucherDate: dateInMonth(m, randInt(5, 24) + k * 2),
        narration: `Seed: Customer receipt against outstanding invoice (batch ${m + 1}-${k + 1})`,
        entries: [
          { accountId: acc.get(intoAccount)!, debitAmount: amount, creditAmount: 0 },
          { accountId: acc.get('AR-001')!, debitAmount: 0, creditAmount: amount },
        ],
      });
      postedCount++;
    }

    // 2 vendor payments (AP settled from cash/bank).
    for (let k = 0; k < 2; k++) {
      const amount = round2(randInt(4000, 50000));
      const fromAccount = k % 2 === 0 ? 'BANK-001' : 'CASH-001';
      await postVoucher({
        typeCode: 'PAYMENT',
        voucherDate: dateInMonth(m, randInt(6, 26) + k * 2),
        narration: `Seed: Vendor payment settled (batch ${m + 1}-${k + 1})`,
        entries: [
          { accountId: acc.get('AP-001')!, debitAmount: amount, creditAmount: 0 },
          { accountId: acc.get(fromAccount)!, debitAmount: 0, creditAmount: amount },
        ],
      });
      postedCount++;
    }

    // Every other month, a contra entry (cash deposited into bank).
    if (m % 2 === 0) {
      const amount = round2(randInt(3000, 25000));
      await postVoucher({
        typeCode: 'CONTRA',
        voucherDate: dateInMonth(m, randInt(27, 28)),
        narration: `Seed: Cash deposited to bank (${MONTHS[m].month}/${MONTHS[m].year})`,
        entries: [
          { accountId: acc.get('BANK-001')!, debitAmount: amount, creditAmount: 0 },
          { accountId: acc.get('CASH-001')!, debitAmount: 0, creditAmount: amount },
        ],
      });
      postedCount++;
    }
  }

  // A few DRAFT vouchers in the current month (Oct 2026) so draft_pending / by_status aren't all POSTED.
  for (let k = 0; k < 3; k++) {
    const amount = round2(randInt(2000, 20000));
    await postVoucher({
      typeCode: k % 2 === 0 ? 'JOURNAL' : 'PAYMENT',
      voucherDate: dateInMonth(5, randInt(10, 14)),
      narration: `Seed: Pending draft entry awaiting review (${k + 1})`,
      status: 'DRAFT',
      entries:
        k % 2 === 0
          ? [
              { accountId: acc.get('EXP-002')!, debitAmount: amount, creditAmount: 0 },
              { accountId: acc.get('BANK-001')!, debitAmount: 0, creditAmount: amount },
            ]
          : [
              { accountId: acc.get('AP-001')!, debitAmount: amount, creditAmount: 0 },
              { accountId: acc.get('CASH-001')!, debitAmount: 0, creditAmount: amount },
            ],
    });
    postedCount++;
  }

  // A couple of CANCELLED vouchers spread earlier, for status-breakdown variety.
  for (let k = 0; k < 2; k++) {
    const amount = round2(randInt(2000, 15000));
    await postVoucher({
      typeCode: 'RECEIPT',
      voucherDate: dateInMonth(k === 0 ? 1 : 3, randInt(5, 20)),
      narration: `Seed: Receipt voucher cancelled after entry error (${k + 1})`,
      status: 'CANCELLED',
      entries: [
        { accountId: acc.get('BANK-001')!, debitAmount: amount, creditAmount: 0 },
        { accountId: acc.get('AR-001')!, debitAmount: 0, creditAmount: amount },
      ],
    });
    postedCount++;
  }

  // Write the advanced sequence counters back so the real app's numbering never collides with seeded numbers.
  for (const [, state] of seqState) {
    await prisma.voucherNumberSequence.upsert({
      where: { voucherTypeId_fyId: { voucherTypeId: state.typeId, fyId } },
      update: { currentNumber: state.current },
      create: { voucherTypeId: state.typeId, fyId, currentNumber: state.current },
    });
  }

  console.log(`  (accounts) posted ${postedCount} vouchers (journal/payment/receipt/contra) across May-Oct 2026.`);
}
