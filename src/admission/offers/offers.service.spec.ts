/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { OffersService } from './offers.service';

const actor = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Officer',
  is_institute_admin: false,
};

const HOUR = 3600 * 1000;
const future = (h: number) => new Date(Date.now() + h * HOUR);
const past = (h: number) => new Date(Date.now() - h * HOUR);

const baseOffer = (over: Record<string, unknown> = {}) => ({
  offer_id: 3,
  application_id: 1,
  status: 'offered',
  offer_date: past(48),
  offer_expiry_date: future(24),
  seat_category: 'General',
  ...over,
});

describe('OffersService', () => {
  const db = {
    admissionOffer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    admissionApplication: { updateMany: jest.fn() },
    admissionPayment: { count: jest.fn() },
    admissionConfirmation: { count: jest.fn() },
    admissionNotification: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db));

  const lookup = { lockApplication: jest.fn(), application: jest.fn() };
  const seats = { lockAndAssertSeatAvailable: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { queue: jest.fn(), queueMany: jest.fn() };
  const service = new OffersService(
    db as never,
    lookup as never,
    seats as never,
    audit as never,
    notifications as never,
  );

  const offerWithApplication = (over: Record<string, unknown> = {}) => ({
    ...baseOffer(over),
    application: {
      application_id: 1,
      application_number: 'APP/1',
      applicant: { email: 'a@b.c', phone: '9999999999' },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.lockApplication.mockResolvedValue({
      application_id: 1,
      program_id: 5,
      session_id: 2,
      status: 'shortlisted',
    });
    lookup.application.mockResolvedValue({ application_id: 1 });
    seats.lockAndAssertSeatAvailable.mockResolvedValue({
      total_seats: 2,
      held: 1,
    });
    db.admissionApplication.updateMany.mockResolvedValue({ count: 1 });
    db.admissionOffer.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('issue', () => {
    const dto = {
      offer_expiry_date: future(72).toISOString(),
      seat_category: 'General',
    };

    it('rejects an expiry in the past', async () => {
      await expect(
        service.issue(actor, 1, {
          ...dto,
          offer_expiry_date: past(1).toISOString(),
        }),
      ).rejects.toMatchObject({
        response: {
          error: expect.stringMatching(/INVALID_EXPIRY|OFFER_EXPIRY_IN_PAST/),
        },
      });
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('only shortlisted/waitlisted applications can be offered', async () => {
      lookup.lockApplication.mockResolvedValue({
        application_id: 1,
        status: 'under_review',
      });
      await expect(service.issue(actor, 1, dto)).rejects.toMatchObject({
        response: { error: 'APPLICATION_NOT_OFFERABLE' },
      });
      expect(db.admissionOffer.create).not.toHaveBeenCalled();
    });

    it('an outstanding or accepted offer blocks a second one (409)', async () => {
      db.admissionOffer.findUnique.mockResolvedValue(
        baseOffer({ status: 'accepted' }),
      );
      await expect(service.issue(actor, 1, dto)).rejects.toMatchObject({
        status: 409,
        response: { error: 'OFFER_ALREADY_EXISTS' },
      });
    });

    it('checks seats under lock and surfaces "no seats" as a 409 without creating the offer', async () => {
      db.admissionOffer.findUnique.mockResolvedValue(null);
      const conflict = Object.assign(new Error('x'), {
        status: 409,
        response: { error: 'NO_SEATS_AVAILABLE' },
      });
      seats.lockAndAssertSeatAvailable.mockRejectedValue(conflict);
      await expect(service.issue(actor, 1, dto)).rejects.toBe(conflict);
      expect(seats.lockAndAssertSeatAvailable).toHaveBeenCalledWith(db, 5, 2);
      expect(db.admissionOffer.create).not.toHaveBeenCalled();
      expect(db.admissionApplication.updateMany).not.toHaveBeenCalled();
    });

    it('creates the offer and moves shortlisted/waitlisted → offered in the same transaction', async () => {
      db.admissionOffer.findUnique
        .mockResolvedValueOnce(null) // existing?
        .mockResolvedValueOnce(offerWithApplication()); // getForApplication
      db.admissionOffer.create.mockResolvedValue(baseOffer());
      await service.issue(actor, 1, dto);
      expect(db.admissionOffer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          application_id: 1,
          status: 'offered',
          seat_category: 'General',
        }),
      });
      expect(db.admissionApplication.updateMany).toHaveBeenCalledWith({
        where: {
          application_id: 1,
          status: { in: ['shortlisted', 'waitlisted'] },
        },
        data: { status: 'offered' },
      });
      expect(notifications.queue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'offer_issued' }),
      );
    });

    it('re-uses the row of an expired/declined offer instead of failing on the unique key', async () => {
      db.admissionOffer.findUnique
        .mockResolvedValueOnce(baseOffer({ status: 'expired' }))
        .mockResolvedValueOnce(offerWithApplication());
      db.admissionOffer.update.mockResolvedValue(baseOffer());
      await service.issue(actor, 1, dto);
      expect(db.admissionOffer.create).not.toHaveBeenCalled();
      expect(db.admissionOffer.update).toHaveBeenCalledWith({
        where: { offer_id: 3 },
        data: expect.objectContaining({
          status: 'offered',
          responded_by: null,
          responded_at: null,
        }),
      });
    });
  });

  describe('accept — expiry is enforced by the backend, never assumed', () => {
    it('accepts a live offer with a guarded update that also re-checks expiry in the DB', async () => {
      db.admissionOffer.findUnique
        .mockResolvedValueOnce(baseOffer())
        .mockResolvedValueOnce(offerWithApplication({ status: 'accepted' }));
      const result = await service.accept(actor, 1);
      expect(db.admissionOffer.updateMany).toHaveBeenCalledWith({
        where: {
          offer_id: 3,
          status: 'offered',
          offer_expiry_date: { gt: expect.any(Date) },
        },
        data: expect.objectContaining({
          status: 'accepted',
          responded_by: 'u1',
        }),
      });
      expect(result.status).toBe('accepted');
    });

    it('an expired offer cannot be accepted, and is expired on the spot (lazy expiry) with the seat released', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(
        baseOffer({ offer_expiry_date: past(1) }),
      );
      await expect(service.accept(actor, 1)).rejects.toMatchObject({
        status: 422,
        response: {
          error: 'OFFER_EXPIRED',
          message: 'This offer has already expired.',
        },
      });
      // it flipped the stored status…
      expect(db.admissionOffer.updateMany).toHaveBeenCalledWith({
        where: {
          offer_id: 3,
          status: 'offered',
          offer_expiry_date: { lte: expect.any(Date) },
        },
        data: { status: 'expired' },
      });
      // …returned the application to shortlisted…
      expect(db.admissionApplication.updateMany).toHaveBeenCalledWith({
        where: { application_id: 1, status: { in: ['offered'] } },
        data: { status: 'shortlisted' },
      });
      // …and never recorded an acceptance
      expect(db.admissionOffer.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'accepted' }),
        }),
      );
    });

    it('an already-expired status is refused without touching anything', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(
        baseOffer({ status: 'expired' }),
      );
      await expect(service.accept(actor, 1)).rejects.toMatchObject({
        response: { error: 'OFFER_EXPIRED' },
      });
      expect(db.admissionOffer.updateMany).not.toHaveBeenCalled();
    });

    it('accepting twice is a 409', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(
        baseOffer({ status: 'accepted' }),
      );
      await expect(service.accept(actor, 1)).rejects.toMatchObject({
        status: 409,
        response: { error: 'OFFER_ALREADY_ACCEPTED' },
      });
    });

    it('a declined offer cannot be accepted', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(
        baseOffer({ status: 'declined' }),
      );
      await expect(service.accept(actor, 1)).rejects.toMatchObject({
        response: { error: 'OFFER_ALREADY_DECLINED' },
      });
    });

    it('losing a race to another processor is a 409, not a silent overwrite', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(baseOffer());
      db.admissionOffer.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.accept(actor, 1)).rejects.toMatchObject({
        status: 409,
        response: { error: 'OFFER_STATUS_CONFLICT' },
      });
    });

    it('no offer → 404', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(null);
      await expect(service.accept(actor, 1)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('decline', () => {
    it('cancels the application (seat released)', async () => {
      db.admissionOffer.findUnique
        .mockResolvedValueOnce(baseOffer())
        .mockResolvedValueOnce(offerWithApplication({ status: 'declined' }));
      await service.decline(actor, 1, { reason: 'Moved' });
      expect(db.admissionApplication.updateMany).toHaveBeenCalledWith({
        where: { application_id: 1, status: { in: ['offered'] } },
        data: { status: 'cancelled' },
      });
    });

    it('an accepted offer with money/confirmation behind it cannot be declined', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(
        baseOffer({ status: 'accepted' }),
      );
      db.admissionPayment.count.mockResolvedValue(1);
      db.admissionConfirmation.count.mockResolvedValue(0);
      await expect(service.decline(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'OFFER_CANNOT_BE_DECLINED' },
      });
      expect(db.admissionApplication.updateMany).not.toHaveBeenCalled();
    });

    it('declining an overdue offer reports expiry instead', async () => {
      db.admissionOffer.findUnique.mockResolvedValueOnce(
        baseOffer({ offer_expiry_date: past(2) }),
      );
      await expect(service.decline(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'OFFER_EXPIRED' },
      });
    });
  });

  describe('scheduler entry points', () => {
    it('expireOverdueOffers flips only genuinely overdue outstanding offers and counts them', async () => {
      db.admissionOffer.findMany.mockResolvedValue([
        {
          offer_id: 3,
          application_id: 1,
          application: { institute_id: 'inst-1' },
        },
        {
          offer_id: 4,
          application_id: 2,
          application: { institute_id: 'inst-1' },
        },
      ]);
      db.admissionOffer.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 }); // 2nd already handled elsewhere
      const expired = await service.expireOverdueOffers(new Date());
      expect(expired).toBe(1);
      expect(db.admissionOffer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'offered',
            offer_expiry_date: { lte: expect.any(Date) },
          },
        }),
      );
      // audit is system-attributed (no actor)
      expect(audit.log).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ action: 'expire', newStatus: 'expired' }),
      );
    });

    it('queueExpiryReminders sends one reminder per offer and never re-sends', async () => {
      db.admissionOffer.findMany.mockResolvedValue(
        [
          offerWithApplication({ offer_id: 3 }),
          offerWithApplication({ offer_id: 4 }),
        ].map((o) => ({
          ...o,
          application: { ...o.application, institute_id: 'inst-1' },
        })),
      );
      db.admissionNotification.findMany.mockResolvedValue([{ entity_id: 3 }]); // offer 3 already reminded
      const queued = await service.queueExpiryReminders();
      expect(queued).toBe(1);
      const [sent] = notifications.queueMany.mock.calls[0] as [
        { entityId: number }[],
      ];
      expect(sent.map((n) => n.entityId)).toEqual([4]);
    });
  });

  describe('read model', () => {
    it('exposes a backend-computed countdown and flags a pending-sweep expiry', async () => {
      db.admissionOffer.findUnique.mockResolvedValue(
        offerWithApplication({ offer_expiry_date: past(1) }),
      );
      const overdue = await service.getForApplication('inst-1', 1);
      expect(overdue.seconds_until_expiry).toBe(0);
      expect(overdue.expiry_pending_sweep).toBe(true);

      db.admissionOffer.findUnique.mockResolvedValue(
        offerWithApplication({ offer_expiry_date: future(1) }),
      );
      const live = await service.getForApplication('inst-1', 1);
      expect(live.seconds_until_expiry).toBeGreaterThan(3500);
      expect(live.expiry_pending_sweep).toBe(false);

      db.admissionOffer.findUnique.mockResolvedValue(
        offerWithApplication({ status: 'accepted' }),
      );
      expect(
        (await service.getForApplication('inst-1', 1)).seconds_until_expiry,
      ).toBeNull();
    });
  });
});
