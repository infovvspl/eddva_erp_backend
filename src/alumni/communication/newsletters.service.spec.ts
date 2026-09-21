/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { NewslettersService } from './newsletters.service';
import { CommunicationLogsService } from './communication-logs.service';
import { BusinessException } from '../common/business-exception';

const officer = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Olivia',
  user_role: 'Officer',
  is_institute_admin: false,
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (e) {
    const res = (e as BusinessException).getResponse?.() as { error?: string };
    return res?.error ?? (e as Error).constructor.name;
  }
};

describe('NewslettersService', () => {
  const db: Record<string, any> = {
    alumniNewsletter: {
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    alumniProfile: { findMany: jest.fn(), count: jest.fn() },
    alumniCommunicationLog: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = { newsletter: jest.fn(), lock: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyStaff: jest.fn() };
  const svc = new NewslettersService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );
  const draft = (over: Record<string, unknown> = {}) => ({
    newsletter_id: 1,
    title: 'Reunion',
    status: 'draft',
    target_segment: { batch_years: [2015] },
    ...over,
  });
  const recipients = (n: number, from = 1) =>
    Array.from({ length: n }, (_, i) => ({
      alumni_id: from + i,
      email: `a${from + i}@x.com`,
      phone: `+91 90000000${from + i}`,
    }));

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    lookup.newsletter.mockResolvedValue(draft());
    db.alumniNewsletter.updateMany.mockResolvedValue({ count: 1 });
    db.alumniCommunicationLog.createMany.mockImplementation(
      ({ data }: { data: unknown[] }) =>
        Promise.resolve({ count: data.length }),
    );
  });

  describe('authoring', () => {
    it('stores only the normalised segment — unknown keys never reach the database', async () => {
      db.alumniNewsletter.create.mockImplementation(
        ({ data }: { data: object }) => Promise.resolve(data),
      );
      await svc.create(officer, {
        title: 'T',
        content: 'C',
        target_segment: { batch_years: [2015], evil: 'DROP TABLE' } as never,
      });
      const data = db.alumniNewsletter.create.mock.calls[0][0].data;
      expect(data.target_segment).toEqual({ batch_years: [2015] });
    });

    it('an audience must be chosen explicitly', async () => {
      expect(
        await code(
          svc.create(officer as never, {
            title: 'T',
            content: 'C',
            target_segment: {},
          }),
        ),
      ).toBe('INVALID_SEGMENT');
    });

    it('a sent newsletter can no longer be edited or deleted', async () => {
      lookup.newsletter.mockResolvedValue(draft({ status: 'sent' }));
      expect(await code(svc.update(officer as never, 1, { title: 'x' }))).toBe(
        'NEWSLETTER_ALREADY_SENT',
      );
      expect(await code(svc.remove(officer as never, 1))).toBe(
        'NEWSLETTER_ALREADY_SENT',
      );
    });

    it('an edit that loses a race with sending is refused (compare-and-set on draft)', async () => {
      db.alumniNewsletter.updateMany.mockResolvedValue({ count: 0 });
      expect(await code(svc.update(officer as never, 1, { title: 'x' }))).toBe(
        'NEWSLETTER_ALREADY_SENT',
      );
    });
  });

  describe('sending', () => {
    it('cannot be sent twice', async () => {
      lookup.newsletter.mockResolvedValue(draft({ status: 'sent' }));
      expect(await code(svc.send(officer as never, 1, {}))).toBe(
        'NEWSLETTER_ALREADY_SENT',
      );
      expect(db.alumniCommunicationLog.createMany).not.toHaveBeenCalled();
    });

    it('a concurrent second send loses the draft → sent compare-and-set', async () => {
      db.alumniNewsletter.updateMany.mockResolvedValue({ count: 0 });
      expect(await code(svc.send(officer as never, 1, {}))).toBe(
        'NEWSLETTER_ALREADY_SENT',
      );
      expect(db.alumniCommunicationLog.createMany).not.toHaveBeenCalled();
    });

    it('resolves the audience now, in batches, and queues one log per recipient (never a sent status)', async () => {
      db.alumniProfile.findMany
        .mockResolvedValueOnce(recipients(1000))
        .mockResolvedValueOnce(recipients(5, 1001))
        .mockResolvedValueOnce([]);
      const out = await svc.send(officer, 1, {});
      expect(out).toMatchObject({
        status: 'sent',
        recipient_count: 1005,
        queued_by_channel: { email: 1005 },
      });
      expect(db.alumniCommunicationLog.createMany).toHaveBeenCalledTimes(2);
      const first = db.alumniCommunicationLog.createMany.mock.calls[0][0];
      expect(first.skipDuplicates).toBe(true);
      expect(
        first.data.every((l: { status: string }) => l.status === 'queued'),
      ).toBe(true);
      expect(first.data[0]).toMatchObject({
        newsletter_id: 1,
        channel: 'email',
        recipient: 'a1@x.com',
      });
      // keyset pagination: the second batch starts after the last id of the first
      expect(
        db.alumniProfile.findMany.mock.calls[1][0].where.alumni_id,
      ).toEqual({ gt: 1000 });
    });

    it('sms goes to the phone number, email to the address', async () => {
      db.alumniProfile.findMany
        .mockResolvedValueOnce(recipients(2))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(recipients(2))
        .mockResolvedValueOnce([]);
      await svc.send(officer, 1, { channels: ['email', 'sms'] });
      const [emailCall, smsCall] = (
        db.alumniCommunicationLog.createMany.mock.calls as any[][]
      ).map((c) => c[0].data[0] as Record<string, unknown>);
      expect(emailCall).toMatchObject({
        channel: 'email',
        recipient: 'a1@x.com',
      });
      expect(smsCall).toMatchObject({
        channel: 'sms',
        recipient: '+91 900000001',
      });
    });

    it('the audience query only addresses verified, active, opted-in alumni of this institute', async () => {
      db.alumniProfile.findMany.mockResolvedValue([]);
      await code(svc.send(officer, 1, {}));
      const where = db.alumniProfile.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        institute_id: 'inst-1',
        is_active: true,
        verification_status: 'verified',
        email_opt_in: true,
      });
    });

    it('an empty audience aborts the whole send so the newsletter stays a draft', async () => {
      db.alumniProfile.findMany.mockResolvedValue([]);
      expect(await code(svc.send(officer as never, 1, {}))).toBe(
        'NO_RECIPIENTS',
      );
      expect(audit.log).not.toHaveBeenCalled();
      expect(notifications.notifyStaff).not.toHaveBeenCalled();
    });

    it('is audited and staff are told', async () => {
      db.alumniProfile.findMany
        .mockResolvedValueOnce(recipients(3))
        .mockResolvedValueOnce([]);
      await svc.send(officer, 1, {});
      expect(audit.log).toHaveBeenCalledWith(
        officer,
        expect.objectContaining({
          action: 'send',
          oldStatus: 'draft',
          newStatus: 'sent',
        }),
      );
      expect(notifications.notifyStaff).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'newsletter_sent' }),
      );
    });
  });
});

describe('CommunicationLogsService', () => {
  const db: Record<string, any> = {
    alumniCommunicationLog: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };
  const svc = new CommunicationLogsService(db as never, audit as never);
  const log = (over: Record<string, unknown> = {}) => ({
    log_id: 1,
    newsletter_id: 2,
    alumni_id: 3,
    channel: 'email',
    status: 'queued',
    opened_at: null,
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    db.alumniCommunicationLog.findFirst.mockResolvedValue(log());
    db.alumniCommunicationLog.updateMany.mockResolvedValue({ count: 1 });
    db.alumniCommunicationLog.findUniqueOrThrow.mockResolvedValue(
      log({ status: 'sent' }),
    );
  });

  it('open/click cannot be recorded for a message that was never sent', async () => {
    expect(
      await code(svc.updateStatus(officer as never, 1, { status: 'opened' })),
    ).toBe('INVALID_STATUS_TRANSITION');
    expect(
      await code(svc.updateStatus(officer as never, 1, { status: 'clicked' })),
    ).toBe('INVALID_STATUS_TRANSITION');
  });

  it('records sent with a timestamp and audits it', async () => {
    await svc.updateStatus(officer, 1, { status: 'sent' });
    const call = db.alumniCommunicationLog.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ log_id: 1, status: 'queued' });
    expect(call.data.sent_at).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalled();
  });

  it('a click implies an open and sets both timestamps', async () => {
    db.alumniCommunicationLog.findFirst.mockResolvedValue(
      log({ status: 'sent' }),
    );
    await svc.updateStatus(officer, 1, { status: 'clicked' });
    const data = db.alumniCommunicationLog.updateMany.mock.calls[0][0].data;
    expect(data.opened_at).toBeInstanceOf(Date);
    expect(data.clicked_at).toBeInstanceOf(Date);
  });

  it('a failure keeps its reason', async () => {
    await svc.updateStatus(officer, 1, {
      status: 'failed',
      failure_reason: 'mailbox full',
    });
    expect(
      db.alumniCommunicationLog.updateMany.mock.calls[0][0].data.failure_reason,
    ).toBe('mailbox full');
  });

  it('a duplicate provider callback that lost the race just returns the current state', async () => {
    db.alumniCommunicationLog.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      svc.updateStatus(officer as never, 1, { status: 'sent' }),
    ).resolves.toBeDefined();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('logs of another institute are not found', async () => {
    db.alumniCommunicationLog.findFirst.mockResolvedValue(null);
    await expect(
      svc.updateStatus(officer as never, 1, { status: 'sent' }),
    ).rejects.toThrow(/not found/);
    expect(
      db.alumniCommunicationLog.findFirst.mock.calls[0][0].where.institute_id,
    ).toBe('inst-1');
  });
});
