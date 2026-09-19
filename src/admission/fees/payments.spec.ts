/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '@prisma/client';
import { ApplicationFeesService } from '../application-fees/application-fees.service';
import { AdmissionPaymentsService } from './admission-payments.service';

const actor = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Officer',
  is_institute_admin: false,
};
const D = (n: number) => new Prisma.Decimal(n);
const today = new Date().toISOString().slice(0, 10);

describe('ApplicationFeesService (application fee — separate from admission fee)', () => {
  const db = {
    admissionApplicationFeePayment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const lookup = { lockApplication: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new ApplicationFeesService(
    db as never,
    lookup as never,
    audit as never,
  );

  const dto = {
    amount: 500,
    payment_date: today,
    payment_mode: 'upi' as const,
    status: 'success' as const,
    transaction_ref: 'UPI-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.lockApplication.mockResolvedValue({
      application_id: 1,
      status: 'submitted',
    });
    db.admissionApplicationFeePayment.findUnique.mockResolvedValue(null);
    db.admissionApplicationFeePayment.findFirst.mockResolvedValue(null);
    db.admissionApplicationFeePayment.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ payment_id: 1, amount: D(500), ...data }),
    );
  });

  it('records exactly the status supplied — nothing is defaulted to success', async () => {
    await service.record(actor, 1, { ...dto, status: 'pending' });
    expect(db.admissionApplicationFeePayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'pending' }),
    });
  });

  it('a successful non-cash payment needs a transaction reference', async () => {
    await expect(
      service.record(actor, 1, { ...dto, transaction_ref: undefined }),
    ).rejects.toMatchObject({
      response: { error: 'TRANSACTION_REF_REQUIRED' },
    });
    // cash needs none
    await expect(
      service.record(actor, 1, {
        ...dto,
        payment_mode: 'cash',
        transaction_ref: undefined,
      }),
    ).resolves.toBeDefined();
  });

  it('a pending non-cash payment does not need a reference yet', async () => {
    await expect(
      service.record(actor, 1, {
        ...dto,
        status: 'pending',
        transaction_ref: undefined,
      }),
    ).resolves.toBeDefined();
  });

  it('cannot pay twice once a successful payment exists (409)', async () => {
    db.admissionApplicationFeePayment.findFirst.mockResolvedValue({
      payment_id: 9,
    });
    await expect(service.record(actor, 1, dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'APPLICATION_FEE_ALREADY_PAID' },
    });
    expect(db.admissionApplicationFeePayment.create).not.toHaveBeenCalled();
  });

  it('idempotency key: a replay returns the original payment and creates nothing', async () => {
    const original = {
      payment_id: 77,
      status: 'success',
      amount: D(500),
      payment_mode: 'upi',
      transaction_ref: 'UPI-1',
    };
    db.admissionApplicationFeePayment.findUnique.mockResolvedValue(original);
    const result = await service.record(actor, 1, {
      ...dto,
      idempotency_key: 'k1',
    });
    expect(result).toBe(original);
    expect(db.admissionApplicationFeePayment.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled(); // a replay is a no-op
  });

  it('the application row is locked while the "already paid" check and insert happen', async () => {
    await service.record(actor, 1, dto);
    expect(lookup.lockApplication).toHaveBeenCalledWith('inst-1', 1, db);
  });

  it.each(['cancelled', 'rejected', 'admitted'])(
    'no fees on a %s application',
    async (status) => {
      lookup.lockApplication.mockResolvedValue({ application_id: 1, status });
      await expect(service.record(actor, 1, dto)).rejects.toMatchObject({
        response: { error: 'APPLICATION_CLOSED' },
      });
    },
  );

  it('future-dated payments are refused', async () => {
    const future = new Date(Date.now() + 10 * 86400000)
      .toISOString()
      .slice(0, 10);
    await expect(
      service.record(actor, 1, { ...dto, payment_date: future }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_PAYMENT_DATE' },
    });
  });

  it('only a pending payment can be settled; settling twice is a 409', async () => {
    db.admissionApplicationFeePayment.findFirst.mockResolvedValueOnce({
      payment_id: 3,
      status: 'success',
      payment_mode: 'upi',
      transaction_ref: 'x',
    });
    await expect(
      service.settle(actor, 1, 3, { status: 'failed' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'PAYMENT_ALREADY_SETTLED' },
    });
  });
});

describe('AdmissionPaymentsService (admission fee → receipt)', () => {
  const db = {
    admissionPayment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    admissionOffer: { findUnique: jest.fn() },
    admissionConfirmation: { findUnique: jest.fn() },
    admissionFeeStructure: { findUnique: jest.fn() },
    admissionApplication: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { lockApplication: jest.fn() };
  const numbering = { next: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { queue: jest.fn() };
  const service = new AdmissionPaymentsService(
    db as never,
    lookup as never,
    numbering as never,
    audit as never,
    notifications as never,
  );

  const dto = {
    amount_paid: 10000,
    payment_date: today,
    payment_mode: 'cash' as const,
  };
  const feeState = (required: number | null, paid: number) => {
    db.admissionFeeStructure.findUnique.mockResolvedValue(
      required === null ? null : { amount: D(required), due_date: new Date() },
    );
    db.admissionPayment.aggregate.mockResolvedValue({
      _sum: { amount_paid: D(paid) },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.lockApplication.mockResolvedValue({
      application_id: 1,
      program_id: 5,
      session_id: 2,
      status: 'offered',
    });
    db.admissionPayment.findUnique.mockResolvedValue(null);
    db.admissionOffer.findUnique.mockResolvedValue({ status: 'accepted' });
    db.admissionConfirmation.findUnique.mockResolvedValue(null);
    feeState(25000, 0);
    numbering.next.mockResolvedValue('RCPT/2027-28/00001');
    db.admissionPayment.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ payment_id: 1, amount_paid: D(10000), ...data }),
    );
    db.admissionApplication.findUniqueOrThrow.mockResolvedValue({
      application_id: 1,
      program_id: 5,
      session_id: 2,
      application_number: 'APP/1',
      applicant: { email: 'a@b.c', phone: '9' },
    });
  });

  it('issues a receipt number inside the transaction and returns the new fee position', async () => {
    feeState(25000, 0);
    const result = await service.record(actor, 1, dto);
    expect(numbering.next).toHaveBeenCalledWith('RECEIPT', db);
    expect(result.payment.receipt_number).toBe('RCPT/2027-28/00001');
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'record' }),
    );
    expect(notifications.queue).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment_receipt' }),
    );
  });

  it('only after the offer is accepted', async () => {
    db.admissionOffer.findUnique.mockResolvedValue({ status: 'offered' });
    await expect(service.record(actor, 1, dto)).rejects.toMatchObject({
      response: { error: 'OFFER_NOT_ACCEPTED' },
    });
    expect(numbering.next).not.toHaveBeenCalled();
  });

  it('refuses when no fee structure is configured', async () => {
    feeState(null, 0);
    await expect(service.record(actor, 1, dto)).rejects.toMatchObject({
      response: { error: 'ADMISSION_FEE_NOT_CONFIGURED' },
    });
  });

  it('never accepts more than the outstanding balance (partial payments are fine)', async () => {
    feeState(25000, 20000);
    await expect(
      service.record(actor, 1, { ...dto, amount_paid: 5001 }),
    ).rejects.toMatchObject({
      response: {
        error: 'PAYMENT_EXCEEDS_BALANCE',
        details: { balance: '5000', attempted: '5001' },
      },
    });
    await expect(
      service.record(actor, 1, { ...dto, amount_paid: 5000 }),
    ).resolves.toBeDefined();
  });

  it('a fully paid fee accepts no further payment (409)', async () => {
    feeState(25000, 25000);
    await expect(service.record(actor, 1, dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'ADMISSION_FEE_ALREADY_PAID' },
    });
  });

  it('non-cash payments need a transaction reference', async () => {
    await expect(
      service.record(actor, 1, { ...dto, payment_mode: 'bank_transfer' }),
    ).rejects.toMatchObject({
      response: { error: 'TRANSACTION_REF_REQUIRED' },
    });
    expect(lookup.lockApplication).not.toHaveBeenCalled(); // rejected before touching the DB
  });

  it('idempotency: replaying a key returns the original receipt and issues no new number', async () => {
    const original = {
      payment_id: 55,
      receipt_number: 'RCPT/2027-28/00009',
      amount_paid: D(10000),
    };
    db.admissionPayment.findUnique.mockResolvedValue(original);
    const result = await service.record(actor, 1, {
      ...dto,
      idempotency_key: 'k',
    });
    expect(result.payment).toBe(original);
    expect(numbering.next).not.toHaveBeenCalled();
    expect(db.admissionPayment.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled(); // a replay is a no-op
    expect(notifications.queue).not.toHaveBeenCalled(); // no duplicate receipt notification
  });

  it('an already-confirmed admission takes no more payments', async () => {
    db.admissionConfirmation.findUnique.mockResolvedValue({
      confirmation_id: 1,
    });
    await expect(service.record(actor, 1, dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'ADMISSION_ALREADY_CONFIRMED' },
    });
  });

  it('locks the application row so concurrent payments cannot both pass the balance check', async () => {
    await service.record(actor, 1, dto);
    expect(lookup.lockApplication).toHaveBeenCalledWith('inst-1', 1, db);
  });
});
