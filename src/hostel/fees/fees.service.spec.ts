/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { FeePlansService } from './fee-plans.service';

const actor = {
  eddva_user_id: 'a1',
  institute_id: 'inst-1',
  user_name: 'Amy',
  user_role: 'Accountant',
  is_institute_admin: false,
};
const D = (n: number | string) => new Prisma.Decimal(n);

const resident = {
  resident_id: 7,
  student_name: 'Aarav',
  guardian_phone: '+91 98',
  guardian_email: null,
  vacated_on: null,
};
const plan = (over: Record<string, unknown> = {}) => ({
  fee_plan_id: 3,
  name: 'Double monthly',
  room_type: 'double',
  includes_mess: true,
  amount: D(6500),
  billing_cycle: 'monthly',
  is_active: true,
  ...over,
});
const invoice = (over: Record<string, unknown> = {}) => ({
  invoice_id: 11,
  institute_id: 'inst-1',
  invoice_no: 'HINV/2026-27/00001',
  resident_id: 7,
  amount_due: D(6500),
  amount_paid: D(0),
  payment_status: 'unpaid',
  cancelled_at: null,
  due_date: new Date('2026-09-11'),
  ...over,
});

describe('InvoicesService', () => {
  const db = {
    hostelRoomAllotment: { findFirst: jest.fn() },
    hostelFeeInvoice: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const lookup = {
    resident: jest.fn(),
    feePlan: jest.fn(),
    invoice: jest.fn(),
    lockInvoice: jest.fn(),
  };
  const numbering = { next: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyGuardian: jest.fn() };
  const service = new InvoicesService(
    db as never,
    lookup as never,
    numbering as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.resident.mockResolvedValue(resident);
    lookup.feePlan.mockResolvedValue(plan());
    db.hostelRoomAllotment.findFirst.mockResolvedValue({
      room: { room_type: 'double' },
    });
    numbering.next.mockResolvedValue('HINV/2026-27/00001');
    db.hostelFeeInvoice.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ invoice_id: 11, amount_paid: D(0), ...data }),
    );
  });

  it('snapshots the plan terms onto the invoice — a later plan change cannot alter it', async () => {
    const result = await service.generate(actor, {
      resident_id: 7,
      fee_plan_id: 3,
      billing_period_start: '2026-09-01',
    });
    const data = db.hostelFeeInvoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      plan_name: 'Double monthly',
      room_type: 'double',
      includes_mess: true,
      billing_cycle: 'monthly',
      billing_period: '2026-09',
    });
    expect(data.amount_due.toString()).toBe('6500');
    expect(result.balance).toBe('6500.00');
  });

  it('refuses an inactive plan', async () => {
    lookup.feePlan.mockResolvedValue(plan({ is_active: false }));
    await expect(
      service.generate(actor, {
        resident_id: 7,
        fee_plan_id: 3,
        billing_period_start: '2026-09-01',
      }),
    ).rejects.toMatchObject({ response: { error: 'FEE_PLAN_INACTIVE' } });
  });

  it('bills by room type: a plan for another room type is refused', async () => {
    db.hostelRoomAllotment.findFirst.mockResolvedValue({
      room: { room_type: 'dormitory' },
    });
    await expect(
      service.generate(actor, {
        resident_id: 7,
        fee_plan_id: 3,
        billing_period_start: '2026-09-01',
      }),
    ).rejects.toMatchObject({
      response: { error: 'FEE_PLAN_ROOM_TYPE_MISMATCH' },
    });
    expect(db.hostelFeeInvoice.create).not.toHaveBeenCalled();
  });

  it('a duplicate invoice for the same resident and period is a 409', async () => {
    db.hostelFeeInvoice.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await expect(
      service.generate(actor, {
        resident_id: 7,
        fee_plan_id: 3,
        billing_period_start: '2026-09-01',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('a period must start on the 1st', async () => {
    await expect(
      service.generate(actor, {
        resident_id: 7,
        fee_plan_id: 3,
        billing_period_start: '2026-09-10',
      }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_BILLING_PERIOD' } });
  });

  it('cannot bill a period that begins after the resident vacated', async () => {
    lookup.resident.mockResolvedValue({
      ...resident,
      vacated_on: new Date('2026-08-15'),
    });
    await expect(
      service.generate(actor, {
        resident_id: 7,
        fee_plan_id: 3,
        billing_period_start: '2026-09-01',
      }),
    ).rejects.toMatchObject({ response: { error: 'RESIDENT_NOT_ACTIVE' } });
  });

  it('notifies the guardian when an invoice is generated', async () => {
    await service.generate(actor, {
      resident_id: 7,
      fee_plan_id: 3,
      billing_period_start: '2026-09-01',
    });
    expect(notifications.notifyGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'fee_invoice_generated' }),
      resident,
    );
  });

  describe('cancel', () => {
    beforeEach(() => lookup.invoice.mockResolvedValue(invoice()));

    it('cannot cancel an invoice that has payments', async () => {
      lookup.lockInvoice.mockResolvedValue(invoice({ amount_paid: D(1000) }));
      await expect(
        service.cancel(actor, 11, { reason: 'x' }),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: 'INVOICE_HAS_PAYMENTS' },
      });
    });

    it('cannot cancel twice', async () => {
      lookup.lockInvoice.mockResolvedValue(
        invoice({ cancelled_at: new Date() }),
      );
      await expect(
        service.cancel(actor, 11, { reason: 'x' }),
      ).rejects.toMatchObject({
        response: { error: 'INVOICE_ALREADY_CANCELLED' },
      });
    });
  });

  describe('overdue-fee sweep', () => {
    it('does nothing when no invoice is newly overdue', async () => {
      db.hostelFeeInvoice.findMany.mockResolvedValue([]);
      await expect(service.notifyOverdueInvoices()).resolves.toBe(0);
    });

    it('only picks outstanding, past-due invoices not yet notified (so it never repeats)', async () => {
      db.hostelFeeInvoice.findMany.mockResolvedValue([]);
      await service.notifyOverdueInvoices(new Date('2026-09-21'));
      const where = db.hostelFeeInvoice.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        cancelled_at: null,
        payment_status: { in: ['unpaid', 'partially_paid'] },
        overdue_notified_at: null,
      });
      expect(where.due_date.lt).toEqual(new Date('2026-09-21'));
    });

    it('claims before notifying: a concurrent run notifies nobody', async () => {
      db.hostelFeeInvoice.findMany.mockResolvedValue([
        {
          invoice_id: 1,
          institute_id: 'inst-1',
          invoice_no: 'X',
          due_date: new Date('2026-09-01'),
          amount_due: D(10),
          amount_paid: D(0),
          resident: { student_name: 'A' },
        },
      ]);
      db.hostelFeeInvoice.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.notifyOverdueInvoices()).resolves.toBe(0);
      expect(notifications.notifyGuardian).not.toHaveBeenCalled();
    });
  });
});

describe('PaymentsService', () => {
  const db = {
    hostelFeePayment: {
      create: jest.fn(),
      aggregate: jest.fn(),
      findFirst: jest.fn(),
    },
    hostelFeeInvoice: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    invoice: jest.fn(),
    lockInvoice: jest.fn(),
    resident: jest.fn(),
  };
  const numbering = { next: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyGuardian: jest.fn() };
  const service = new PaymentsService(
    db as never,
    lookup as never,
    numbering as never,
    audit as never,
    notifications as never,
  );
  const pay = (amount: number, over: Record<string, unknown> = {}) =>
    service.record(actor, 11, {
      amount_paid: amount,
      payment_mode: 'cash',
      ...over,
    } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.invoice.mockResolvedValue(invoice());
    lookup.resident.mockResolvedValue(resident);
    numbering.next.mockResolvedValue('HRCPT/2026-27/00001');
    db.hostelFeePayment.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ payment_id: 1, ...data, invoice: {}, resident: {} }),
    );
    db.hostelFeeInvoice.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...invoice(), ...data }),
    );
  });

  it('a partial payment leaves the invoice partially_paid with the right balance', async () => {
    lookup.lockInvoice.mockResolvedValue(invoice());
    const result = await pay(2500);
    expect(db.hostelFeeInvoice.update).toHaveBeenCalledWith({
      where: { invoice_id: 11 },
      data: {
        amount_paid: expect.anything(),
        payment_status: 'partially_paid',
      },
    });
    expect(result.invoice).toMatchObject({
      payment_status: 'partially_paid',
      balance: '4000.00',
    });
  });

  it('paying the exact outstanding balance marks the invoice paid', async () => {
    lookup.lockInvoice.mockResolvedValue(
      invoice({ amount_paid: D(2500), payment_status: 'partially_paid' }),
    );
    const result = await pay(4000);
    expect(result.invoice).toMatchObject({
      payment_status: 'paid',
      balance: '0.00',
      amount_paid: '6500.00',
    });
  });

  it('refuses an overpayment and reports the outstanding balance', async () => {
    lookup.lockInvoice.mockResolvedValue(
      invoice({ amount_paid: D(6000), payment_status: 'partially_paid' }),
    );
    await expect(pay(500.01)).rejects.toMatchObject({
      response: {
        error: 'PAYMENT_EXCEEDS_BALANCE',
        details: { outstanding_balance: '500.00' },
      },
    });
    expect(db.hostelFeePayment.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a fully paid invoice (409)', async () => {
    lookup.lockInvoice.mockResolvedValue(
      invoice({ amount_paid: D(6500), payment_status: 'paid' }),
    );
    await expect(pay(1)).rejects.toMatchObject({
      status: 409,
      response: { error: 'INVOICE_ALREADY_PAID' },
    });
  });

  it('refuses a payment on a cancelled invoice (409)', async () => {
    lookup.lockInvoice.mockResolvedValue(invoice({ cancelled_at: new Date() }));
    await expect(pay(10)).rejects.toMatchObject({
      status: 409,
      response: { error: 'INVOICE_CANCELLED' },
    });
  });

  it('locks the invoice row before reading the balance (serialises concurrent cashiers)', async () => {
    lookup.lockInvoice.mockResolvedValue(invoice());
    await pay(100);
    expect(lookup.lockInvoice).toHaveBeenCalledWith('inst-1', 11, db);
    expect(lookup.lockInvoice.mock.invocationCallOrder[0]).toBeLessThan(
      db.hostelFeePayment.create.mock.invocationCallOrder[0],
    );
  });

  it('non-cash payments need a transaction reference', async () => {
    lookup.lockInvoice.mockResolvedValue(invoice());
    await expect(pay(100, { payment_mode: 'upi' })).rejects.toMatchObject({
      response: { error: 'TRANSACTION_REF_REQUIRED' },
    });
    await expect(
      pay(100, { payment_mode: 'card', transaction_ref: 'AUTH-1' }),
    ).resolves.toBeDefined();
  });

  it('a payment date in the future is refused', async () => {
    await expect(
      pay(100, { payment_date: '2999-01-01' }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_PAYMENT_DATE' },
    });
  });

  it('numbers the receipt inside the same transaction and audits both payment and invoice status', async () => {
    lookup.lockInvoice.mockResolvedValue(invoice());
    await pay(100);
    expect(numbering.next).toHaveBeenCalledWith('RECEIPT', db);
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        entityType: 'hostel_fee_payment',
        action: 'record',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        entityType: 'hostel_fee_invoice',
        oldStatus: 'unpaid',
        newStatus: 'partially_paid',
      }),
    );
    expect(notifications.notifyGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'fee_payment_received' }),
      resident,
    );
  });

  it('a receipt reports the balance remaining right after that payment', async () => {
    db.hostelFeePayment.findFirst.mockResolvedValue({
      payment_id: 5,
      invoice_id: 11,
      receipt_no: 'HRCPT/1',
      payment_date: new Date('2026-09-21'),
      amount_paid: D(1000),
      payment_mode: 'cash',
      transaction_ref: null,
      received_by: 'a1',
      resident: { resident_id: 7 },
      invoice: {
        invoice_no: 'HINV/1',
        billing_period: '2026-09',
        amount_due: D(6500),
      },
    });
    db.hostelFeePayment.aggregate.mockResolvedValue({
      _sum: { amount_paid: D(1000) },
    });
    const receipt = await service.receipt('inst-1', 5);
    expect(receipt).toMatchObject({
      balance_after_this_payment: '5500.00',
      total_paid_after_this_payment: '1000.00',
    });
  });
});

describe('FeePlansService', () => {
  const db = {
    hostelFeePlan: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const lookup = { feePlan: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new FeePlansService(
    db as never,
    lookup as never,
    audit as never,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    db.hostelFeePlan.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ fee_plan_id: 1, ...data }),
    );
  });

  it('refuses a second active plan for the same room type / mess option / cycle', async () => {
    db.hostelFeePlan.findFirst.mockResolvedValue({
      fee_plan_id: 9,
      name: 'Existing',
    });
    await expect(
      service.create(actor, {
        name: 'x',
        room_type: 'double',
        includes_mess: true,
        amount: 100,
        billing_cycle: 'monthly',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('records the previous amount when a plan is edited (invoices keep theirs)', async () => {
    lookup.feePlan.mockResolvedValue(plan());
    db.hostelFeePlan.findFirst.mockResolvedValue(null);
    db.hostelFeePlan.update.mockResolvedValue(plan({ amount: D(7000) }));
    await service.update(actor, 3, { amount: 7000 });
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        metadata: expect.objectContaining({ previous_amount: '6500' }),
      }),
    );
  });
});
