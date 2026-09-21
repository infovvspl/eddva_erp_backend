/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DonationsService } from './donations.service';
import { CampaignsService } from './campaigns.service';
import { BusinessException } from '../common/business-exception';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const D = (n: number | string) => new Prisma.Decimal(n);
const officer = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Olivia',
  user_role: 'Officer',
  is_institute_admin: false,
};
const alumnus = (id = 7, verified = true) => ({
  ...officer,
  eddva_user_id: `alumni-${id}`,
  user_role: 'ALUMNI',
  alumni_id: id,
  alumni_verified: verified,
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
const donation = (over: Record<string, unknown> = {}) => ({
  donation_id: 1,
  institute_id: 'inst-1',
  alumni_id: 7,
  campaign_id: 3,
  amount: D('5000.00'),
  payment_mode: 'upi',
  transaction_ref: 'UPI-1',
  is_anonymous: false,
  status: 'pending',
  receipt_number: null,
  ...over,
});
const campaign = (over: Record<string, unknown> = {}) => ({
  campaign_id: 3,
  status: 'active',
  start_date: new Date(Date.now() - 2 * DAY),
  end_date: new Date(Date.now() + 5 * DAY),
  ...over,
});

describe('DonationsService', () => {
  const db: Record<string, any> = {
    alumniDonation: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      findFirst: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const lookup = {
    profile: jest.fn(),
    campaign: jest.fn(),
    donation: jest.fn(),
    lock: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const notifications = { notifyAlumni: jest.fn(), notifyStaff: jest.fn() };
  const numbering = { next: jest.fn() };
  const access = { assertPermission: jest.fn() };
  const svc = new DonationsService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
    numbering as never,
    access as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.profile.mockResolvedValue({
      alumni_id: 7,
      is_active: true,
      email: 'a@x.com',
      full_name: 'Alice',
    });
    lookup.campaign.mockResolvedValue(campaign());
    lookup.donation.mockResolvedValue(donation());
    db.alumniDonation.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve(donation({ ...data, status: 'pending' })),
    );
    numbering.next.mockResolvedValue('ADR/2026-27/00001');
    db.alumniDonation.updateMany.mockResolvedValue({ count: 1 });
    db.alumniDonation.findUniqueOrThrow.mockResolvedValue(
      donation({ status: 'received', receipt_number: 'ADR/2026-27/00001' }),
    );
  });

  describe('creating a donation', () => {
    const dto = { campaign_id: 3, amount: 5000, payment_mode: 'upi' } as never;

    it('an alumnus can only pledge: the donation is pending with no receipt', async () => {
      const d = await svc.create(alumnus(), dto);
      expect(d.status).toBe('pending');
      expect(numbering.next).not.toHaveBeenCalled();
      expect(db.$executeRaw).not.toHaveBeenCalled(); // campaign total untouched
    });

    it('an alumnus can never record a donation as received (no trusting the client)', async () => {
      await expect(
        svc.create(
          alumnus() as never,
          {
            ...(dto as object),
            mark_received: true,
            transaction_ref: 'X',
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('an unverified alumnus cannot donate, nor donate as someone else', async () => {
      await expect(svc.create(alumnus(7, false) as never, dto)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        svc.create(
          alumnus() as never,
          { ...(dto as object), alumni_id: 8 } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('staff must name the donor', async () => {
      expect(await code(svc.create(officer as never, dto))).toBe(
        'ALUMNI_ID_REQUIRED',
      );
    });

    it("recording as received needs the 'confirm' permission and a transaction reference", async () => {
      access.assertPermission.mockRejectedValueOnce(
        new ForbiddenException('no'),
      );
      await expect(
        svc.create(
          officer as never,
          {
            ...(dto as object),
            alumni_id: 7,
            mark_received: true,
            transaction_ref: 'X',
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
      access.assertPermission.mockResolvedValue(undefined);
      expect(
        await code(
          svc.create(
            officer as never,
            { ...(dto as object), alumni_id: 7, mark_received: true } as never,
          ),
        ),
      ).toBe('TRANSACTION_REF_REQUIRED');
    });

    it('staff recording a received donation issues the receipt and re-derives the campaign total atomically', async () => {
      db.alumniDonation.findUniqueOrThrow.mockResolvedValue(
        donation({ status: 'received', receipt_number: 'ADR/2026-27/00001' }),
      );
      lookup.donation.mockResolvedValue(donation());
      const d = await svc.create(officer, {
        ...(dto as object),
        alumni_id: 7,
        mark_received: true,
        transaction_ref: 'UPI-1',
      } as never);
      expect(d.status).toBe('received');
      expect(db.$transaction).toHaveBeenCalledTimes(1); // create + receive share one transaction
      expect(numbering.next).toHaveBeenCalledWith(
        'DONATION_RECEIPT',
        db,
        expect.any(Date),
      );
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'receive' }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'receipt_issued' }),
      );
      expect(notifications.notifyAlumni).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'donation_receipt' }),
        expect.anything(),
      );
    });

    it.each([
      ['closed', { status: 'closed' }, 'CAMPAIGN_NOT_ACTIVE'],
      ['completed', { status: 'completed' }, 'CAMPAIGN_NOT_ACTIVE'],
      [
        'not started',
        { start_date: new Date(Date.now() + 2 * DAY) },
        'CAMPAIGN_NOT_STARTED',
      ],
      ['ended', { end_date: new Date(Date.now() - 3 * DAY) }, 'CAMPAIGN_ENDED'],
    ])('rejects donations to a %s campaign', async (_n, over, expected) => {
      lookup.campaign.mockResolvedValue(campaign(over));
      expect(await code(svc.create(alumnus() as never, dto))).toBe(expected);
      expect(db.alumniDonation.create).not.toHaveBeenCalled();
    });

    it('a general donation (no campaign) skips the campaign checks', async () => {
      await svc.create(alumnus(), {
        amount: 100,
        payment_mode: 'card',
      } as never);
      expect(lookup.campaign).not.toHaveBeenCalled();
    });

    it('a payment reference already on a live donation is a 409 (unique index)', async () => {
      db.alumniDonation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      expect(await code(svc.create(alumnus() as never, dto))).toBe(
        'TRANSACTION_REF_USED',
      );
    });
  });

  describe('confirming (pending → received)', () => {
    it('locks donation then campaign, numbers the receipt, and compare-and-sets the status', async () => {
      await svc.confirm(officer, 1, {});
      const locks = lookup.lock.mock.calls.map((c) => c[1] as string);
      expect(locks).toEqual(['donation', 'campaign']);
      expect(db.alumniDonation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { donation_id: 1, status: 'pending' },
          data: expect.objectContaining({
            status: 'received',
            receipt_number: 'ADR/2026-27/00001',
          }),
        }),
      );
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('only a pending donation can be confirmed — never twice', async () => {
      lookup.donation.mockResolvedValue(donation({ status: 'received' }));
      expect(await code(svc.confirm(officer as never, 1, {}))).toBe(
        'DONATION_NOT_PENDING',
      );
      expect(numbering.next).not.toHaveBeenCalled();
    });

    it('losing the race to a concurrent confirm rolls the receipt number back with the transaction', async () => {
      db.alumniDonation.updateMany.mockResolvedValue({ count: 0 });
      expect(await code(svc.confirm(officer as never, 1, {}))).toBe(
        'DONATION_NOT_PENDING',
      );
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('needs a transaction reference from somewhere', async () => {
      lookup.donation.mockResolvedValue(donation({ transaction_ref: null }));
      expect(await code(svc.confirm(officer as never, 1, {}))).toBe(
        'TRANSACTION_REF_REQUIRED',
      );
      await expect(
        svc.confirm(officer as never, 1, { transaction_ref: 'REF' }),
      ).resolves.toBeDefined();
    });

    it('a closed campaign cannot receive money', async () => {
      lookup.campaign.mockResolvedValue(campaign({ status: 'closed' }));
      expect(await code(svc.confirm(officer as never, 1, {}))).toBe(
        'CAMPAIGN_CLOSED',
      );
    });

    it('the money cannot be received in the future', async () => {
      const future = new Date(Date.now() + DAY).toISOString();
      expect(
        await code(svc.confirm(officer as never, 1, { received_on: future })),
      ).toBe('INVALID_RECEIVED_DATE');
    });
  });

  describe('failing, cancelling, reversing', () => {
    it('only a pending donation can fail or be cancelled', async () => {
      lookup.donation.mockResolvedValue(donation({ status: 'received' }));
      expect(await code(svc.fail(officer as never, 1, {}))).toBe(
        'INVALID_STATUS_TRANSITION',
      );
      expect(await code(svc.cancel(officer as never, 1, {}))).toBe(
        'INVALID_STATUS_TRANSITION',
      );
    });

    it("an alumnus cannot cancel someone else's pledge", async () => {
      lookup.donation.mockResolvedValue(donation({ alumni_id: 9 }));
      await expect(svc.cancel(alumnus(7) as never, 1, {})).rejects.toThrow(
        /not found/,
      );
    });

    it('cancelling a pledge does not touch the campaign total', async () => {
      await svc.cancel(alumnus(7), 1, { reason: 'changed mind' });
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('a received donation can be reversed; the campaign total is re-derived and the reversal audited with its reason', async () => {
      lookup.donation.mockResolvedValue(
        donation({ status: 'received', receipt_number: 'ADR/1' }),
      );
      db.alumniDonation.findUniqueOrThrow.mockResolvedValue(
        donation({ status: 'reversed', receipt_number: 'ADR/1' }),
      );
      await svc.reverse(officer, 1, { reason: 'Cheque bounced' });
      expect(db.alumniDonation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { donation_id: 1, status: 'received' },
        }),
      );
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        officer,
        expect.objectContaining({
          action: 'reverse',
          oldStatus: 'received',
          newStatus: 'reversed',
          reason: 'Cheque bounced',
        }),
      );
    });

    it('a pending, failed or already reversed donation cannot be reversed', async () => {
      for (const status of ['pending', 'failed', 'cancelled', 'reversed']) {
        lookup.donation.mockResolvedValue(donation({ status }));
        expect(
          await code(svc.reverse(officer as never, 1, { reason: 'x' })),
        ).toBe('INVALID_STATUS_TRANSITION');
      }
    });
  });

  describe('privacy of donors', () => {
    const rows = [
      {
        donation_id: 1,
        alumni_id: 7,
        amount: D(100),
        donation_date: new Date(),
        is_anonymous: true,
        alumni: { alumni_id: 7, full_name: 'Alice' },
      },
      {
        donation_id: 2,
        alumni_id: 8,
        amount: D(200),
        donation_date: new Date(),
        is_anonymous: true,
        alumni: { alumni_id: 8, full_name: 'Bob' },
      },
      {
        donation_id: 3,
        alumni_id: 9,
        amount: D(300),
        donation_date: new Date(),
        is_anonymous: false,
        alumni: { alumni_id: 9, full_name: 'Carl' },
      },
    ];
    beforeEach(() => {
      db.$transaction.mockImplementation((ops: unknown) =>
        Promise.all(ops as Promise<unknown>[]),
      );
      db.alumniDonation.findMany.mockResolvedValue(rows);
      db.alumniDonation.count.mockResolvedValue(3);
    });

    it('alumni never see who gave anonymously — except their own gift', async () => {
      const out = await svc.campaignDonations(alumnus(7), 3, {});
      const byId = Object.fromEntries(
        (out.data as Array<{ donation_id: number; donor: unknown }>).map(
          (d) => [d.donation_id, d.donor],
        ),
      );
      expect(byId[1]).toMatchObject({ full_name: 'Alice' }); // own
      expect(byId[2]).toBeNull(); // someone else's anonymous gift
      expect(byId[3]).toMatchObject({ full_name: 'Carl' });
    });

    it('the alumni view exposes no payment references and only received donations', async () => {
      const out = await svc.campaignDonations(alumnus(7), 3, {
        status: 'pending',
      } as never);
      expect(db.alumniDonation.findMany.mock.calls[0][0].where.status).toBe(
        'received',
      );
      expect(JSON.stringify(out.data)).not.toContain('transaction_ref');
    });

    it('staff see the donor behind an anonymous gift (for audit) and may filter by status', async () => {
      const out = await svc.campaignDonations(officer, 3, {
        status: 'pending',
      } as never);
      expect(db.alumniDonation.findMany.mock.calls[0][0].where.status).toBe(
        'pending',
      );
      expect((out.data as Array<{ alumni: unknown }>)[1].alumni).toMatchObject({
        full_name: 'Bob',
      });
    });

    it('an alumnus lists only their own donations regardless of the alumni_id filter', async () => {
      db.alumniDonation.aggregate.mockResolvedValue({ _sum: { amount: null } });
      await svc.findAll(alumnus(7), { alumni_id: 99 });
      expect(db.alumniDonation.findMany.mock.calls[0][0].where.alumni_id).toBe(
        7,
      );
    });

    it("donor history is private: an alumnus cannot read another's", async () => {
      await expect(
        svc.donorHistory(alumnus(7) as never, 8, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('receipts', () => {
    it('are issued only for received donations', async () => {
      db.alumniDonation.findFirst.mockResolvedValue({
        ...donation(),
        alumni: {
          alumni_id: 7,
          full_name: 'A',
          batch_year: 2015,
          program: null,
          email: 'a@x.com',
        },
        campaign: null,
      });
      expect(await code(svc.receipt(alumnus() as never, 1))).toBe(
        'RECEIPT_NOT_AVAILABLE',
      );
    });

    it('a reversed donation keeps its number but is marked void; a general gift is labelled as such', async () => {
      db.alumniDonation.findFirst.mockResolvedValue({
        ...donation({
          status: 'reversed',
          receipt_number: 'ADR/1',
          status_reason: 'bounced',
          campaign_id: null,
        }),
        alumni: {
          alumni_id: 7,
          full_name: 'A',
          batch_year: 2015,
          program: null,
          email: 'a@x.com',
        },
        campaign: null,
      });
      const r = await svc.receipt(alumnus(), 1);
      expect(r).toMatchObject({
        receipt_number: 'ADR/1',
        status: 'void',
        void_reason: 'bounced',
      });
      expect(r.donation.campaign).toBe('General fund');
    });

    it('the lookup is scoped to the donor for alumni (someone else’s receipt is a 404)', async () => {
      db.alumniDonation.findFirst.mockResolvedValue(null);
      await expect(svc.receipt(alumnus(8) as never, 1)).rejects.toThrow(
        /not found/,
      );
      expect(db.alumniDonation.findFirst.mock.calls[0][0].where.alumni_id).toBe(
        8,
      );
    });
  });
});

describe('CampaignsService', () => {
  const db: Record<string, any> = {
    alumniCampaign: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    alumniDonation: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { campaign: jest.fn(), lock: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new CampaignsService(
    db as never,
    lookup as never,
    audit as never,
  );
  const ymd = (off: number) =>
    new Date(Date.now() + off * DAY).toISOString().slice(0, 10);

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    db.alumniCampaign.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({
        campaign_id: 1,
        status: 'active',
        raised_amount: D(0),
        ...data,
      }),
    );
  });

  it('a campaign starts active with nothing raised and a progress of 0%', async () => {
    const c = await svc.create(officer, {
      title: 'T',
      goal_amount: 1000,
      start_date: ymd(0),
      end_date: ymd(10),
    });
    expect(c).toMatchObject({ status: 'active', progress_pct: 0 });
  });

  it('end before start, or already in the past, is rejected', async () => {
    expect(
      await code(
        svc.create(officer as never, {
          title: 'T',
          goal_amount: 1,
          start_date: ymd(5),
          end_date: ymd(1),
        }),
      ),
    ).toBe('INVALID_CAMPAIGN_DATES');
    expect(
      await code(
        svc.create(officer as never, {
          title: 'T',
          goal_amount: 1,
          start_date: ymd(-9),
          end_date: ymd(-3),
        }),
      ),
    ).toBe('INVALID_CAMPAIGN_DATES');
  });

  it('a closed campaign cannot be edited or closed again', async () => {
    lookup.campaign.mockResolvedValue({
      campaign_id: 1,
      status: 'closed',
      start_date: new Date(),
      end_date: new Date(),
    });
    expect(await code(svc.update(officer as never, 1, { title: 'x' }))).toBe(
      'CAMPAIGN_CLOSED',
    );
    db.alumniCampaign.updateMany.mockResolvedValue({ count: 0 });
    expect(await code(svc.close(officer as never, 1))).toBe('CAMPAIGN_CLOSED');
  });

  it('closing reports how many pledges still need resolving', async () => {
    lookup.campaign.mockResolvedValue({
      campaign_id: 1,
      status: 'closed',
      goal_amount: D(10),
      raised_amount: D(0),
    });
    db.alumniCampaign.updateMany.mockResolvedValue({ count: 1 });
    db.alumniDonation.count.mockResolvedValue(4);
    const out = await svc.close(officer, 1);
    expect(out.pending_donations_to_resolve).toBe(4);
  });
});
