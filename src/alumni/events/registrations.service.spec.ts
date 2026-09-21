/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RegistrationsService } from './registrations.service';
import { EventPaymentsService } from './event-payments.service';
import { BusinessException } from '../common/business-exception';
import { RecordEventPaymentDto } from './dto/event.dto';

const HOUR = 3600 * 1000;
const D = (n: number | string) => new Prisma.Decimal(n);

const officer = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Olivia',
  user_role: 'Officer',
  is_institute_admin: false,
};
const alumnus = (verified = true, id = 7) => ({
  ...officer,
  eddva_user_id: `alumni-${id}`,
  user_role: 'ALUMNI',
  alumni_id: id,
  alumni_verified: verified,
});

const event = (over: Record<string, unknown> = {}) => ({
  event_id: 1,
  institute_id: 'inst-1',
  title: 'Reunion',
  status: 'upcoming',
  event_date: new Date(Date.now() + 5 * HOUR),
  ends_at: null,
  registration_deadline: null,
  max_capacity: null,
  is_paid: false,
  ticket_price: null,
  ...over,
});
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (e) {
    const res = (e as BusinessException).getResponse?.() as { error?: string };
    return res?.error ?? (e as Error).constructor.name;
  }
};

describe('RegistrationsService', () => {
  const db: Record<string, any> = {
    alumniEventRegistration: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const lookup = {
    event: jest.fn(),
    profile: jest.fn(),
    lock: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const notifications = { notifyAlumni: jest.fn() };
  const svc = new RegistrationsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.event.mockResolvedValue(event());
    lookup.profile.mockResolvedValue({
      alumni_id: 7,
      is_active: true,
      email: 'a@x.com',
    });
    db.alumniEventRegistration.findUnique.mockResolvedValue(null);
    db.alumniEventRegistration.count.mockResolvedValue(0);
    db.alumniEventRegistration.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ registration_id: 100, ...data }),
    );
    db.alumniEventRegistration.update.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ registration_id: 55, ...data }),
    );
  });

  describe('register', () => {
    it('an unverified alumnus cannot register', async () => {
      await expect(
        svc.register(alumnus(false) as never, 1, {}),
      ).rejects.toThrow(ForbiddenException);
      expect(db.alumniEventRegistration.create).not.toHaveBeenCalled();
    });

    it('an alumnus can only register themselves', async () => {
      await expect(
        svc.register(alumnus() as never, 1, { alumni_id: 8 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('staff must say who to register', async () => {
      expect(await code(svc.register(officer as never, 1, {}))).toBe(
        'ALUMNI_ID_REQUIRED',
      );
    });

    it('refuses a deactivated alumnus', async () => {
      lookup.profile.mockResolvedValue({ alumni_id: 7, is_active: false });
      expect(await code(svc.register(alumnus() as never, 1, {}))).toBe(
        'ALUMNI_INACTIVE',
      );
    });

    it('refuses a cancelled event', async () => {
      lookup.event.mockResolvedValue(event({ status: 'cancelled' }));
      expect(await code(svc.register(alumnus() as never, 1, {}))).toBe(
        'EVENT_CANCELLED',
      );
    });

    it('refuses after the registration deadline', async () => {
      lookup.event.mockResolvedValue(
        event({ registration_deadline: new Date(Date.now() - HOUR) }),
      );
      expect(await code(svc.register(alumnus() as never, 1, {}))).toBe(
        'REGISTRATION_CLOSED',
      );
    });

    it('refuses once the event has started even without a deadline', async () => {
      lookup.event.mockResolvedValue(
        event({
          event_date: new Date(Date.now() - HOUR),
          ends_at: new Date(Date.now() + HOUR),
        }),
      );
      expect(await code(svc.register(alumnus() as never, 1, {}))).toBe(
        'REGISTRATION_CLOSED',
      );
    });

    it('rejects a duplicate active registration with 409', async () => {
      db.alumniEventRegistration.findUnique.mockResolvedValue({
        registration_id: 9,
        attendance_status: 'registered',
      });
      expect(await code(svc.register(alumnus() as never, 1, {}))).toBe(
        'ALREADY_REGISTERED',
      );
      expect(db.alumniEventRegistration.create).not.toHaveBeenCalled();
    });

    it('rejects when the event is full and never writes a row', async () => {
      lookup.event.mockResolvedValue(event({ max_capacity: 100 }));
      db.alumniEventRegistration.count.mockResolvedValue(100);
      const p = svc.register(alumnus(), 1, {});
      expect(await code(p)).toBe('EVENT_FULL');
      expect(db.alumniEventRegistration.create).not.toHaveBeenCalled();
    });

    it('the last seat is still available at capacity - 1', async () => {
      lookup.event.mockResolvedValue(event({ max_capacity: 100 }));
      db.alumniEventRegistration.count.mockResolvedValue(99);
      await expect(
        svc.register(alumnus() as never, 1, {}),
      ).resolves.toBeDefined();
    });

    it('unlimited capacity (null) never counts seats', async () => {
      await svc.register(alumnus(), 1, {});
      expect(db.alumniEventRegistration.count).not.toHaveBeenCalled();
    });

    it('serialises seat allocation by locking the event row inside the transaction', async () => {
      await svc.register(alumnus(), 1, {});
      expect(lookup.lock).toHaveBeenCalledWith(db, 'event', 'inst-1', 1);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      const lockOrder = lookup.lock.mock.invocationCallOrder[0];
      const createOrder = (db.alumniEventRegistration.create as jest.Mock).mock
        .invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(createOrder);
    });

    it('a paid event registration starts payment_status=pending with the price captured', async () => {
      lookup.event.mockResolvedValue(
        event({ is_paid: true, ticket_price: D(500) }),
      );
      const reg = await svc.register(alumnus(), 1, {});
      expect(reg).toMatchObject({ payment_status: 'pending' });
      expect(String((reg as { amount_due: unknown }).amount_due)).toBe('500');
    });

    it('a free event registration has no payment to make', async () => {
      const reg = await svc.register(alumnus(), 1, {});
      expect(reg).toMatchObject({
        payment_status: 'not_applicable',
        attendance_status: 'registered',
      });
    });

    it('re-registering after a cancellation reuses the row (one registration per alumnus/event)', async () => {
      db.alumniEventRegistration.findUnique.mockResolvedValue({
        registration_id: 55,
        attendance_status: 'cancelled',
        payment_status: 'not_applicable',
      });
      await svc.register(alumnus(), 1, {});
      expect(db.alumniEventRegistration.update).toHaveBeenCalled();
      expect(db.alumniEventRegistration.create).not.toHaveBeenCalled();
    });

    it('a previously paid, then cancelled registration stays paid when re-registered', async () => {
      lookup.event.mockResolvedValue(
        event({ is_paid: true, ticket_price: D(500) }),
      );
      db.alumniEventRegistration.findUnique.mockResolvedValue({
        registration_id: 55,
        attendance_status: 'cancelled',
        payment_status: 'paid',
      });
      const reg = await svc.register(alumnus(), 1, {});
      expect(reg).toMatchObject({ payment_status: 'paid' });
    });

    it('audits and notifies after a successful registration', async () => {
      await svc.register(alumnus(), 1, {});
      expect(audit.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'register',
          newStatus: 'registered',
        }),
      );
      expect(notifications.notifyAlumni).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'event_registration_confirmed' }),
        expect.objectContaining({ alumni_id: 7 }),
      );
    });
  });

  describe('cancelRegistration', () => {
    const reg = (over: Record<string, unknown> = {}) => ({
      registration_id: 9,
      institute_id: 'inst-1',
      attendance_status: 'registered',
      payment_status: 'not_applicable',
      alumni: { email: 'a@x.com' },
      ...over,
    });

    it('cannot cancel a registration that was already attended', async () => {
      db.alumniEventRegistration.findUnique.mockResolvedValue(
        reg({ attendance_status: 'attended' }),
      );
      expect(
        await code(
          svc.cancelRegistration(officer as never, 1, { alumni_id: 7 }),
        ),
      ).toBe('REGISTRATION_NOT_CANCELLABLE');
    });

    it('an alumnus cannot cancel after the event started (staff still can)', async () => {
      lookup.event.mockResolvedValue(
        event({ event_date: new Date(Date.now() - HOUR) }),
      );
      db.alumniEventRegistration.findUnique.mockResolvedValue(reg());
      expect(
        await code(svc.cancelRegistration(alumnus() as never, 1, {})),
      ).toBe('EVENT_STARTED');
      db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        svc.cancelRegistration(officer as never, 1, { alumni_id: 7 }),
      ).resolves.toBeDefined();
    });

    it('cancels with a compare-and-set and tells the alumnus a paid ticket needs a manual refund', async () => {
      db.alumniEventRegistration.findUnique.mockResolvedValue(
        reg({ payment_status: 'paid' }),
      );
      db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 1 });
      const out = await svc.cancelRegistration(alumnus(), 1, {});
      expect(db.alumniEventRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { registration_id: 9, attendance_status: 'registered' },
        }),
      );
      expect(out.refund_note).toMatch(/refund/);
    });

    it('a racing change makes the cancel fail cleanly (409) instead of overwriting', async () => {
      db.alumniEventRegistration.findUnique.mockResolvedValue(reg());
      db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 0 });
      expect(
        await code(svc.cancelRegistration(alumnus() as never, 1, {})),
      ).toBe('REGISTRATION_NOT_CANCELLABLE');
    });
  });

  describe('markAttendance', () => {
    const started = () => event({ event_date: new Date(Date.now() - HOUR) });
    const row = (id: number, over: Record<string, unknown> = {}) => ({
      registration_id: id,
      attendance_status: 'registered',
      payment_status: 'not_applicable',
      ...over,
    });

    it('cannot mark attendance for a cancelled or not-yet-started event', async () => {
      lookup.event.mockResolvedValue(event({ status: 'cancelled' }));
      expect(
        await code(
          svc.markAttendance(officer as never, 1, {
            records: [{ registration_id: 1, status: 'attended' }],
          }),
        ),
      ).toBe('EVENT_CANCELLED');
      lookup.event.mockResolvedValue(event());
      expect(
        await code(
          svc.markAttendance(officer as never, 1, {
            records: [{ registration_id: 1, status: 'attended' }],
          }),
        ),
      ).toBe('EVENT_NOT_STARTED');
    });

    it('rejects a request listing the same registration twice', async () => {
      lookup.event.mockResolvedValue(started());
      expect(
        await code(
          svc.markAttendance(officer as never, 1, {
            records: [
              { registration_id: 1, status: 'attended' },
              { registration_id: 1, status: 'no_show' },
            ],
          }),
        ),
      ).toBe('DUPLICATE_RECORDS');
    });

    it('is all-or-nothing: one bad record means nothing is changed', async () => {
      lookup.event.mockResolvedValue(started());
      db.alumniEventRegistration.findMany.mockResolvedValue([
        row(1),
        row(2, { attendance_status: 'cancelled' }),
      ]);
      const p = svc.markAttendance(officer, 1, {
        records: [
          { registration_id: 1, status: 'attended' },
          { registration_id: 2, status: 'attended' },
        ],
      });
      expect(await code(p)).toBe('ATTENDANCE_REJECTED');
      expect(db.alumniEventRegistration.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('a paid ticket must be confirmed before someone is marked attended', async () => {
      lookup.event.mockResolvedValue(
        event({ event_date: new Date(Date.now() - HOUR), is_paid: true }),
      );
      db.alumniEventRegistration.findMany.mockResolvedValue([
        row(1, { payment_status: 'pending' }),
      ]);
      expect(
        await code(
          svc.markAttendance(officer as never, 1, {
            records: [{ registration_id: 1, status: 'attended' }],
          }),
        ),
      ).toBe('ATTENDANCE_REJECTED');
    });

    it('applies changes, skips unchanged records and audits each change with old/new status', async () => {
      lookup.event.mockResolvedValue(started());
      db.alumniEventRegistration.findMany.mockResolvedValue([
        row(1),
        row(2, { attendance_status: 'attended' }),
      ]);
      db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 1 });
      const out = await svc.markAttendance(officer, 1, {
        records: [
          { registration_id: 1, status: 'attended' },
          { registration_id: 2, status: 'attended' },
        ],
      });
      expect(out).toMatchObject({ requested: 2, changed: 1, unchanged: 1 });
      expect(db.alumniEventRegistration.updateMany).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        officer,
        expect.objectContaining({
          action: 'attendance',
          oldStatus: 'registered',
          newStatus: 'attended',
        }),
      );
    });

    it('a registration cancelled mid-request is not overwritten', async () => {
      lookup.event.mockResolvedValue(started());
      db.alumniEventRegistration.findMany.mockResolvedValue([row(1)]);
      db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 0 });
      expect(
        await code(
          svc.markAttendance(officer as never, 1, {
            records: [{ registration_id: 1, status: 'attended' }],
          }),
        ),
      ).toBe('ATTENDANCE_CONFLICT');
    });
  });

  it('no-shows can only be marked after the event has ended', async () => {
    lookup.event.mockResolvedValue(
      event({ event_date: new Date(Date.now() - HOUR) }),
    );
    expect(await code(svc.markNoShows(officer as never, 1))).toBe(
      'EVENT_NOT_ENDED',
    );
  });
});

describe('EventPaymentsService', () => {
  const db: Record<string, any> = {
    alumniEventPayment: { create: jest.fn(), findUnique: jest.fn() },
    alumniEventRegistration: { updateMany: jest.fn() },
    alumniProfile: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { registration: jest.fn(), lock: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyAlumni: jest.fn() };
  const svc = new EventPaymentsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );
  const reg = (over: Record<string, unknown> = {}) => ({
    registration_id: 9,
    alumni_id: 7,
    attendance_status: 'registered',
    payment_status: 'pending',
    amount_due: D(500),
    event: { title: 'Gala', status: 'upcoming', is_paid: true },
    ...over,
  });
  const dto: RecordEventPaymentDto = {
    amount: 500,
    payment_mode: 'upi',
    transaction_ref: 'UPI-1',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.registration.mockResolvedValue(reg());
    db.alumniEventPayment.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ payment_id: 1, ...data }),
    );
    db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 1 });
    db.alumniProfile.findUnique.mockResolvedValue({ email: 'a@x.com' });
  });

  it('records the payment and marks the registration paid in one transaction', async () => {
    const p = await svc.record(officer, 9, dto);
    expect(p).toMatchObject({ registration_id: 9, transaction_ref: 'UPI-1' });
    expect(db.alumniEventRegistration.updateMany).toHaveBeenCalledWith({
      where: { registration_id: 9, payment_status: 'pending' },
      data: { payment_status: 'paid' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      officer,
      expect.objectContaining({ action: 'record', newStatus: 'paid' }),
    );
    expect(notifications.notifyAlumni).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'event_payment_confirmed' }),
      expect.anything(),
    );
  });

  it('the amount must equal the ticket price captured at registration', async () => {
    expect(
      await code(svc.record(officer as never, 9, { ...dto, amount: 499.99 })),
    ).toBe('AMOUNT_MISMATCH');
    expect(db.alumniEventPayment.create).not.toHaveBeenCalled();
  });

  it('a paid registration cannot be paid twice', async () => {
    lookup.registration.mockResolvedValue(reg({ payment_status: 'paid' }));
    expect(await code(svc.record(officer as never, 9, dto))).toBe(
      'ALREADY_PAID',
    );
  });

  it('a lost race on the registration status rolls the payment back (409)', async () => {
    db.alumniEventRegistration.updateMany.mockResolvedValue({ count: 0 });
    expect(await code(svc.record(officer as never, 9, dto))).toBe(
      'ALREADY_PAID',
    );
  });

  it('no payment for a free event, a cancelled registration or a cancelled event', async () => {
    lookup.registration.mockResolvedValue(
      reg({
        event: { title: 'x', status: 'upcoming', is_paid: false },
        amount_due: null,
      }),
    );
    expect(await code(svc.record(officer as never, 9, dto))).toBe(
      'EVENT_NOT_PAID',
    );
    lookup.registration.mockResolvedValue(
      reg({ attendance_status: 'cancelled' }),
    );
    expect(await code(svc.record(officer as never, 9, dto))).toBe(
      'REGISTRATION_CANCELLED',
    );
    lookup.registration.mockResolvedValue(
      reg({ event: { title: 'x', status: 'cancelled', is_paid: true } }),
    );
    expect(await code(svc.record(officer as never, 9, dto))).toBe(
      'EVENT_CANCELLED',
    );
  });

  it('paid_at cannot be in the future', async () => {
    const future = new Date(Date.now() + 24 * HOUR).toISOString();
    expect(
      await code(svc.record(officer as never, 9, { ...dto, paid_at: future })),
    ).toBe('INVALID_PAYMENT_DATE');
  });

  it('a reused transaction reference (unique violation) becomes a 409, not a 500', async () => {
    db.alumniEventPayment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    expect(await code(svc.record(officer as never, 9, dto))).toBe(
      'PAYMENT_ALREADY_RECORDED',
    );
  });

  it('an alumnus can read only their own payment', async () => {
    lookup.registration.mockResolvedValue(reg());
    await expect(svc.find(alumnus(true, 8) as never, 9)).rejects.toThrow(
      /not found/,
    );
    db.alumniEventPayment.findUnique.mockResolvedValue({ payment_id: 1 });
    await expect(svc.find(alumnus(true, 7) as never, 9)).resolves.toEqual({
      payment_id: 1,
    });
  });
});
