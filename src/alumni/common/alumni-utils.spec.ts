import { BadRequestException } from '@nestjs/common';
import {
  APPLICATION_TRANSITIONS,
  DONATION_TRANSITIONS,
  MATCH_TRANSITIONS,
  PROGRAM_TRANSITIONS,
  assertTransition,
  canTransition,
} from './alumni-state';
import { normalizeSegment, buildSegmentWhere } from '../communication/segment';
import { COMM_TRANSITIONS } from '../communication/communication-logs.service';
import { summariseLogs } from '../communication/newsletters.service';
import {
  assertEventFields,
  effectiveEventStatus,
  eventEnd,
  registrationClosesAt,
} from '../events/events.service';
import { effectiveJobStatus } from '../jobs/jobs.service';
import { normalizeTags } from '../mentorship/mentors.service';
import { assertValidYears } from '../auth/alumni-registration.service';
import {
  canViewProfile,
  peerView,
  publicView,
  summaryFor,
  viewFor,
  visibleProfilesWhere,
} from './alumni-profile.view';
import { escapeHtml, renderReceiptHtml } from '../fundraising/receipt.renderer';
import { toCsv } from './csv.util';
import { matchesSignature } from './alumni-file-storage.service';
import { buildDateRange, parsePagination, parseSort } from './pagination.util';
import { parseDateOnly } from './time.util';
import { BusinessException } from './business-exception';
import { enumParam } from './enum-param';

const HOUR = 3600 * 1000;

describe('status machines', () => {
  it.each([
    ['applied', 'shortlisted', true],
    ['applied', 'hired', true],
    ['applied', 'withdrawn', true],
    ['shortlisted', 'rejected', true],
    ['shortlisted', 'applied', false],
    ['hired', 'rejected', false],
    ['rejected', 'hired', false],
    ['withdrawn', 'applied', false],
  ] as const)('application %s → %s is %s', (from, to, ok) => {
    expect(canTransition(APPLICATION_TRANSITIONS, from, to)).toBe(ok);
  });

  it('program: open → active → completed only, never back', () => {
    expect(
      canTransition(PROGRAM_TRANSITIONS, 'open_for_signup', 'active'),
    ).toBe(true);
    expect(
      canTransition(PROGRAM_TRANSITIONS, 'open_for_signup', 'completed'),
    ).toBe(true);
    expect(
      canTransition(PROGRAM_TRANSITIONS, 'active', 'open_for_signup'),
    ).toBe(false);
    expect(canTransition(PROGRAM_TRANSITIONS, 'completed', 'active')).toBe(
      false,
    );
  });

  it('match: active ends in completed or discontinued, both terminal', () => {
    expect(canTransition(MATCH_TRANSITIONS, 'active', 'completed')).toBe(true);
    expect(canTransition(MATCH_TRANSITIONS, 'active', 'discontinued')).toBe(
      true,
    );
    expect(canTransition(MATCH_TRANSITIONS, 'completed', 'active')).toBe(false);
    expect(canTransition(MATCH_TRANSITIONS, 'discontinued', 'completed')).toBe(
      false,
    );
  });

  it('donation: money is only ever received from pending, and only a received donation can be reversed', () => {
    expect(canTransition(DONATION_TRANSITIONS, 'pending', 'received')).toBe(
      true,
    );
    expect(canTransition(DONATION_TRANSITIONS, 'failed', 'received')).toBe(
      false,
    );
    expect(canTransition(DONATION_TRANSITIONS, 'cancelled', 'received')).toBe(
      false,
    );
    expect(canTransition(DONATION_TRANSITIONS, 'reversed', 'received')).toBe(
      false,
    );
    expect(canTransition(DONATION_TRANSITIONS, 'received', 'reversed')).toBe(
      true,
    );
    expect(canTransition(DONATION_TRANSITIONS, 'pending', 'reversed')).toBe(
      false,
    );
    expect(canTransition(DONATION_TRANSITIONS, 'received', 'pending')).toBe(
      false,
    );
  });

  it('delivery feedback only moves forward', () => {
    expect(canTransition(COMM_TRANSITIONS, 'queued', 'sent')).toBe(true);
    expect(canTransition(COMM_TRANSITIONS, 'queued', 'opened')).toBe(false);
    expect(canTransition(COMM_TRANSITIONS, 'sent', 'clicked')).toBe(true);
    expect(canTransition(COMM_TRANSITIONS, 'clicked', 'opened')).toBe(false);
    expect(canTransition(COMM_TRANSITIONS, 'failed', 'sent')).toBe(false);
  });

  it('assertTransition throws a structured 422 listing what would be allowed', () => {
    try {
      assertTransition(
        APPLICATION_TRANSITIONS,
        'hired',
        'rejected',
        'The application',
      );
      fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessException);
      const body = (e as BusinessException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.error).toBe('INVALID_STATUS_TRANSITION');
      expect((e as BusinessException).getStatus()).toBe(422);
    }
  });
});

describe('newsletter segments', () => {
  it('requires an explicit audience: an empty segment is rejected, never "everyone"', () => {
    expect(() => normalizeSegment({})).toThrow(BusinessException);
    expect(() => normalizeSegment(undefined)).toThrow(BusinessException);
    expect(() => normalizeSegment({ batch_years: [], programs: [] })).toThrow(
      BusinessException,
    );
  });

  it('all=true cannot be combined with filters', () => {
    expect(() => normalizeSegment({ all: true, batch_years: [2015] })).toThrow(
      /cannot also carry filters/,
    );
    expect(normalizeSegment({ all: true })).toEqual({ all: true });
  });

  it('keeps only whitelisted keys, trims and de-duplicates', () => {
    const seg = normalizeSegment({
      batch_years: [2015, 2015, 2016],
      cities: [' Bangalore ', 'Bangalore', ''],
      evil: '1; DROP TABLE x',
      $where: 'x',
    } as never);
    expect(seg).toEqual({ batch_years: [2015, 2016], cities: ['Bangalore'] });
    expect(Object.keys(seg)).not.toContain('evil');
  });

  it('evaluates against current data: verified + active + opted-in only, filters AND-ed, values OR-ed', () => {
    const where = buildSegmentWhere(
      'inst-1',
      { batch_years: [2015, 2016], cities: ['Bangalore'], group_ids: [3] },
      'email',
    );
    expect(where).toMatchObject({
      institute_id: 'inst-1',
      is_active: true,
      verification_status: 'verified',
      email_opt_in: true,
    });
    const and = where.AND as unknown[];
    expect(and).toContainEqual({ batch_year: { in: [2015, 2016] } });
    expect(and).toContainEqual({
      OR: [{ city: { equals: 'Bangalore', mode: 'insensitive' } }],
    });
    expect(JSON.stringify(and)).toContain('"is_active":true'); // group must be active
  });

  it('sms needs an opt-in and a phone number', () => {
    const where = buildSegmentWhere('inst-1', { all: true }, 'sms');
    expect(where).toMatchObject({ sms_opt_in: true, phone: { not: null } });
    expect(where.AND).toBeUndefined();
  });

  it('a tenant boundary is always present', () => {
    expect(
      buildSegmentWhere('inst-9', { all: true }, 'email').institute_id,
    ).toBe('inst-9');
  });
});

describe('delivery statistics', () => {
  it('rolls status counts into delivery / open / click rates', () => {
    const s = summariseLogs([
      { channel: 'email', status: 'queued', _count: { _all: 10 } },
      { channel: 'email', status: 'sent', _count: { _all: 60 } },
      { channel: 'email', status: 'opened', _count: { _all: 20 } },
      { channel: 'email', status: 'clicked', _count: { _all: 10 } },
      { channel: 'email', status: 'failed', _count: { _all: 10 } },
    ]);
    expect(s.total_messages).toBe(110);
    expect(s.delivered).toBe(90);
    expect(s.opened).toBe(30);
    expect(s.clicked).toBe(10);
    expect(s.delivery_rate).toBe(0.9); // 90 of the 100 that left the queue
    expect(s.open_rate).toBe(0.3333);
    expect(s.click_rate).toBe(0.1111);
  });

  it('rates are null (not fabricated) when nothing was delivered', () => {
    const s = summariseLogs([
      { channel: 'email', status: 'queued', _count: { _all: 5 } },
    ]);
    expect(s.delivery_rate).toBeNull();
    expect(s.open_rate).toBeNull();
    expect(s.click_rate).toBeNull();
    expect(summariseLogs([]).total_messages).toBe(0);
  });
});

describe('event rules', () => {
  const now = new Date('2026-06-01T10:00:00Z');
  const ev = (over: Record<string, unknown>) =>
    ({
      status: 'upcoming',
      event_date: new Date(now.getTime() + 2 * HOUR),
      ends_at: null,
      registration_deadline: null,
      ...over,
    }) as never;

  it('effective status is derived from the dates, not only the stored value', () => {
    expect(effectiveEventStatus(ev({}), now)).toBe('upcoming');
    expect(
      effectiveEventStatus(
        ev({ event_date: new Date(now.getTime() - HOUR) }),
        now,
      ),
    ).toBe('ongoing');
    expect(
      effectiveEventStatus(
        ev({ event_date: new Date(now.getTime() - 30 * HOUR) }),
        now,
      ),
    ).toBe('completed');
    expect(
      effectiveEventStatus(
        ev({
          event_date: new Date(now.getTime() - HOUR),
          ends_at: new Date(now.getTime() + HOUR),
        }),
        now,
      ),
    ).toBe('ongoing');
    expect(effectiveEventStatus(ev({ status: 'cancelled' }), now)).toBe(
      'cancelled',
    );
  });

  it('an event with no end lasts a day', () => {
    const e = ev({});
    expect(
      eventEnd(e).getTime() - (e as { event_date: Date }).event_date.getTime(),
    ).toBe(24 * HOUR);
  });

  it('registration closes at the deadline, or when the event starts', () => {
    const start = new Date(now.getTime() + 5 * HOUR);
    const deadline = new Date(now.getTime() + 3 * HOUR);
    expect(
      registrationClosesAt({
        event_date: start,
        registration_deadline: deadline,
      }),
    ).toEqual(deadline);
    expect(
      registrationClosesAt({ event_date: start, registration_deadline: null }),
    ).toEqual(start);
  });

  const fields = (over: Record<string, unknown> = {}) => ({
    event_date: new Date(now.getTime() + 5 * HOUR),
    ends_at: null,
    registration_deadline: null,
    mode: 'offline' as const,
    venue: 'Hall',
    online_link: null,
    is_paid: false,
    ticket_price: null,
    max_capacity: null,
    ...over,
  });

  it('valid free and paid events pass; unlimited capacity is allowed', () => {
    expect(() => assertEventFields(fields())).not.toThrow();
    expect(() =>
      assertEventFields(
        fields({ is_paid: true, ticket_price: 500, max_capacity: 100 }),
      ),
    ).not.toThrow();
  });

  it.each([
    [
      'deadline after the event',
      { registration_deadline: new Date(now.getTime() + 9 * HOUR) },
    ],
    ['end before start', { ends_at: new Date(now.getTime() + 4 * HOUR) }],
    ['offline without venue', { venue: null }],
    ['online without link', { mode: 'online', venue: null, online_link: null }],
    ['hybrid without link', { mode: 'hybrid', online_link: null }],
    ['paid without price', { is_paid: true, ticket_price: null }],
    ['paid with zero price', { is_paid: true, ticket_price: 0 }],
    ['free with a price', { is_paid: false, ticket_price: 10 }],
    ['zero capacity', { max_capacity: 0 }],
    ['negative capacity', { max_capacity: -1 }],
  ])('rejects: %s', (_name, over) => {
    expect(() =>
      assertEventFields(fields(over as Record<string, unknown>)),
    ).toThrow(BusinessException);
  });
});

describe('job status', () => {
  const now = new Date('2026-06-01T10:00:00Z');
  it('an open posting past its expiry date is expired even before the sweep runs', () => {
    expect(
      effectiveJobStatus(
        { status: 'open', expiry_date: new Date(now.getTime() - 1) },
        now,
      ),
    ).toBe('expired');
    expect(
      effectiveJobStatus(
        { status: 'open', expiry_date: new Date(now.getTime() + HOUR) },
        now,
      ),
    ).toBe('open');
    expect(effectiveJobStatus({ status: 'open', expiry_date: null }, now)).toBe(
      'open',
    );
    expect(
      effectiveJobStatus(
        { status: 'closed', expiry_date: new Date(now.getTime() + HOUR) },
        now,
      ),
    ).toBe('closed');
  });
});

describe('mentor expertise tags', () => {
  it('normalises case, whitespace and duplicates so tags are exactly matchable', () => {
    expect(
      normalizeTags([
        ' Product  Management ',
        'product management',
        'LEADERSHIP',
        '',
      ]),
    ).toEqual(['product management', 'leadership']);
  });
});

describe('alumni years', () => {
  const year = new Date().getUTCFullYear();
  it('accepts consistent years', () => {
    expect(() => assertValidYears(2010, 2012)).not.toThrow();
    expect(() => assertValidYears(year, year)).not.toThrow();
    expect(() => assertValidYears(2010, undefined)).not.toThrow();
  });
  it('rejects the future and graduation before batch', () => {
    expect(() => assertValidYears(year + 1, undefined)).toThrow(
      BusinessException,
    );
    expect(() => assertValidYears(2010, year + 1)).toThrow(BusinessException);
    expect(() => assertValidYears(2012, 2010)).toThrow(BusinessException);
  });
});

describe('profile privacy views', () => {
  const profile = (over: Record<string, unknown> = {}) =>
    ({
      alumni_id: 5,
      full_name: 'Dina',
      batch_year: 2015,
      graduation_year: 2015,
      program: 'MBA',
      email: 'dina@example.com',
      phone: '+91 9',
      current_company: 'Acme',
      current_designation: 'PM',
      industry: 'Tech',
      city: 'Pune',
      country: 'India',
      linkedin_url: 'https://linkedin.com/in/d',
      photo_path: 'uploads/alumni/x/photos/a.png',
      photo_mime: 'image/png',
      verification_status: 'verified',
      visibility: 'alumni_only',
      contact_visible: false,
      is_active: true,
      ...over,
    }) as never;
  const staffV = { kind: 'staff' } as const;
  const verifiedPeer = { kind: 'alumni', alumniId: 9, verified: true } as const;
  const unverifiedPeer = {
    kind: 'alumni',
    alumniId: 9,
    verified: false,
  } as const;
  const owner = { kind: 'alumni', alumniId: 5, verified: false } as const;
  const publicV = { kind: 'public' } as const;

  it('private: only the owner and staff', () => {
    const p = profile({ visibility: 'private' });
    expect(canViewProfile(staffV, p)).toBe(true);
    expect(canViewProfile(owner, p)).toBe(true);
    expect(canViewProfile(verifiedPeer, p)).toBe(false);
    expect(canViewProfile(publicV, p)).toBe(false);
  });

  it('alumni_only: verified alumni only — not unverified alumni, not the public', () => {
    const p = profile({ visibility: 'alumni_only' });
    expect(canViewProfile(verifiedPeer, p)).toBe(true);
    expect(canViewProfile(unverifiedPeer, p)).toBe(false);
    expect(canViewProfile(publicV, p)).toBe(false);
  });

  it('public: everyone, but only once verified and active', () => {
    expect(canViewProfile(publicV, profile({ visibility: 'public' }))).toBe(
      true,
    );
    expect(
      canViewProfile(unverifiedPeer, profile({ visibility: 'public' })),
    ).toBe(true);
    expect(
      canViewProfile(
        publicV,
        profile({ visibility: 'public', verification_status: 'pending' }),
      ),
    ).toBe(false);
    expect(
      canViewProfile(
        verifiedPeer,
        profile({ visibility: 'public', is_active: false }),
      ),
    ).toBe(false);
  });

  it('a pending or deactivated profile is still visible to its owner', () => {
    expect(
      canViewProfile(owner, profile({ verification_status: 'pending' })),
    ).toBe(true);
    expect(canViewProfile(owner, profile({ is_active: false }))).toBe(true);
  });

  it('the SQL filter mirrors the in-memory rule', () => {
    expect(visibleProfilesWhere(staffV)).toEqual({});
    expect(visibleProfilesWhere(publicV)).toEqual({
      is_active: true,
      verification_status: 'verified',
      visibility: 'public',
    });
    const peer = visibleProfilesWhere(verifiedPeer) as {
      OR: Array<Record<string, unknown>>;
    };
    expect(peer.OR[0]).toEqual({ alumni_id: 9 });
    expect(peer.OR[1]).toMatchObject({
      visibility: { in: ['public', 'alumni_only'] },
    });
    const unv = visibleProfilesWhere(unverifiedPeer) as {
      OR: Array<Record<string, unknown>>;
    };
    expect(unv.OR[1]).toMatchObject({ visibility: { in: ['public'] } });
  });

  it('peers never get contact details unless the owner allows it; staff and owner always do', () => {
    expect(peerView(profile())).not.toHaveProperty('email');
    expect(peerView(profile())).not.toHaveProperty('phone');
    expect(peerView(profile({ contact_visible: true }))).toMatchObject({
      email: 'dina@example.com',
    });
    expect(viewFor(staffV, profile())).toHaveProperty('email');
    expect(viewFor(owner, profile())).toHaveProperty('email');
    expect(viewFor(verifiedPeer, profile())).not.toHaveProperty('email');
  });

  it('the public card never has e-mail, phone or LinkedIn', () => {
    const card = publicView(
      profile({ visibility: 'public', contact_visible: true }),
    );
    expect(card).not.toHaveProperty('email');
    expect(card).not.toHaveProperty('phone');
    expect(card).not.toHaveProperty('linkedin_url');
  });

  it('internal storage paths never leave the server', () => {
    for (const v of [staffV, owner, verifiedPeer, publicV]) {
      const out = viewFor(v, profile({ visibility: 'public' })) as Record<
        string,
        unknown
      >;
      expect(out).not.toHaveProperty('photo_path');
      expect(out).not.toHaveProperty('photo_mime');
      expect(out.has_photo).toBe(true);
    }
  });

  it('summaryFor strips contact for peers but keeps it for staff / consenting owners', () => {
    const row = {
      alumni_id: 5,
      full_name: 'D',
      batch_year: 2015,
      graduation_year: null,
      program: null,
      current_company: null,
      current_designation: null,
      industry: null,
      city: null,
      country: null,
      email: 'd@example.com',
      phone: '1',
      contact_visible: false,
    };
    expect(summaryFor(verifiedPeer, row)).not.toHaveProperty('email');
    expect(summaryFor(staffV, row)).toHaveProperty('email');
    expect(summaryFor(owner, row)).toHaveProperty('email');
    expect(
      summaryFor(verifiedPeer, { ...row, contact_visible: true }),
    ).toHaveProperty('email');
    expect(
      summaryFor(publicV, { ...row, contact_visible: true }),
    ).not.toHaveProperty('email');
  });
});

describe('receipt rendering', () => {
  it('escapes HTML so donor-controlled text cannot inject markup into the PDF', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'q\'')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;',
    );
    const html = renderReceiptHtml({
      receipt_number: 'ADR/2026-27/00001',
      issued_at: new Date('2026-09-21T00:00:00Z'),
      status: 'valid',
      void_reason: null,
      institute_id: 'i',
      donor: {
        name: '<img src=x onerror=alert(1)>',
        batch_year: 2015,
        program: 'MBA',
        email: 'a@b.c',
      },
      donation: {
        amount: '5000.00',
        campaign: 'General fund',
        donation_date: new Date('2026-09-20T00:00:00Z'),
        payment_mode: 'bank_transfer',
        transaction_ref: 'REF<1>',
      },
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('ADR/2026-27/00001');
    expect(html).toContain('bank transfer');
    expect(html).not.toContain('VOID');
  });

  it('a reversed donation renders as VOID with its reason', () => {
    const html = renderReceiptHtml({
      receipt_number: 'ADR/1',
      issued_at: null,
      status: 'void',
      void_reason: 'Cheque bounced',
      institute_id: 'i',
      donor: { name: 'A', batch_year: 2015, program: null, email: 'a@b.c' },
      donation: {
        amount: '1.00',
        campaign: 'X',
        donation_date: new Date(),
        payment_mode: 'cheque',
        transaction_ref: null,
      },
    });
    expect(html).toContain('VOID');
    expect(html).toContain('Cheque bounced');
  });
});

describe('csv export', () => {
  it('quotes commas/quotes/newlines and neutralises spreadsheet formulas', () => {
    const csv = toCsv(
      [{ a: 'x,y', b: 'say "hi"', c: '=SUM(A1)', d: null }],
      ['a', 'b', 'c', 'd'],
    );
    expect(csv).toBe('a,b,c,d\r\n"x,y","say ""hi""",\'=SUM(A1),');
  });
});

describe('upload content checks', () => {
  it('magic numbers must match the declared type', () => {
    expect(matchesSignature(Buffer.from('%PDF-1.4'), 'application/pdf')).toBe(
      true,
    );
    expect(matchesSignature(Buffer.from('MZ....'), 'application/pdf')).toBe(
      false,
    );
    expect(
      matchesSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
    ).toBe(true);
    expect(matchesSignature(Buffer.from('GIF89a'), 'image/png')).toBe(false);
    expect(
      matchesSignature(
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
    expect(matchesSignature(Buffer.from('anything'), 'text/html')).toBe(false);
  });
});

describe('query helpers', () => {
  it('pagination is bounded', () => {
    expect(parsePagination({ page: -4, limit: 100000 })).toMatchObject({
      page: 1,
      limit: 200,
      skip: 0,
    });
    expect(parsePagination({ page: 3, limit: 10 })).toMatchObject({
      skip: 20,
      take: 10,
    });
  });
  it('sort fields are whitelisted', () => {
    expect(parseSort('password_hash', ['name'] as const, 'name')).toBe('name');
  });
  it('date ranges validate input (400) and reject inverted ranges', () => {
    expect(() => buildDateRange('nope', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => buildDateRange('2026-02-01', '2026-01-01')).toThrow(
      BadRequestException,
    );
    expect(buildDateRange('2026-01-01', '2026-01-31')?.lte?.toISOString()).toBe(
      '2026-01-31T23:59:59.999Z',
    );
  });
  it('calendar dates must be real', () => {
    expect(() => parseDateOnly('2026-02-31')).toThrow(BadRequestException);
    expect(parseDateOnly('2026-02-28').toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });
  it('enum filters answer 400, not a database error', () => {
    expect(() => enumParam('bogus', ['a', 'b'] as const, 'status')).toThrow(
      BadRequestException,
    );
    expect(enumParam('a', ['a', 'b'] as const, 'status')).toBe('a');
    expect(enumParam('', ['a'] as const, 'status')).toBeUndefined();
  });
});
