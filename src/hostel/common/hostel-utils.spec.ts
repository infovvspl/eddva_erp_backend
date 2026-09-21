import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  COMPLAINT_TRANSITIONS,
  GATE_PASS_TRANSITIONS,
  assertTransition,
} from './hostel-state';
import {
  dateOnlyString,
  dayRange,
  localToday,
  parseDateOnly,
  parseDateTime,
  sessionWindow,
} from './time.util';
import { isValidAcademicYear } from './validation';
import {
  decryptIdProof,
  encryptIdProof,
  maskIdProof,
} from './id-proof-crypto.util';
import { enumParam } from './enum-param';
import { toCsv } from './csv.util';
import { billingPeriodFor } from '../fees/billing-period.util';

describe('gate pass state machine', () => {
  it('only an approved pass can go out, and only out/overdue can return', () => {
    expect(GATE_PASS_TRANSITIONS.approved).toContain('out');
    expect(GATE_PASS_TRANSITIONS.pending).not.toContain('out');
    expect(GATE_PASS_TRANSITIONS.rejected).not.toContain('out');
    expect(GATE_PASS_TRANSITIONS.out).toContain('returned');
    expect(GATE_PASS_TRANSITIONS.overdue).toContain('returned');
    expect(GATE_PASS_TRANSITIONS.approved).not.toContain('returned');
  });

  it('overdue is reachable only from out — an unused approved pass expires instead', () => {
    const sources = Object.entries(GATE_PASS_TRANSITIONS)
      .filter(([, to]) => to.includes('overdue'))
      .map(([from]) => from);
    expect(sources).toEqual(['out']);
    expect(GATE_PASS_TRANSITIONS.approved).toContain('expired');
  });

  it('a returned pass can never become overdue again', () => {
    expect(GATE_PASS_TRANSITIONS.returned).toEqual([]);
  });

  it('assertTransition throws a 409 INVALID_STATE_TRANSITION listing the allowed moves', () => {
    try {
      assertTransition(
        GATE_PASS_TRANSITIONS,
        'rejected',
        'approved',
        'Gate pass',
      );
      fail('should have thrown');
    } catch (e) {
      const err = e as {
        getStatus(): number;
        getResponse(): { error: string };
      };
      expect(err.getStatus()).toBe(409);
      expect(err.getResponse().error).toBe('INVALID_STATE_TRANSITION');
    }
  });
});

describe('complaint state machine', () => {
  it('follows open → in_progress → resolved → closed', () => {
    expect(() =>
      assertTransition(COMPLAINT_TRANSITIONS, 'open', 'in_progress', 'C'),
    ).not.toThrow();
    expect(() =>
      assertTransition(COMPLAINT_TRANSITIONS, 'in_progress', 'resolved', 'C'),
    ).not.toThrow();
    expect(() =>
      assertTransition(COMPLAINT_TRANSITIONS, 'resolved', 'closed', 'C'),
    ).not.toThrow();
  });

  it('a resolved complaint can be re-opened to in_progress, but closed is terminal', () => {
    expect(() =>
      assertTransition(COMPLAINT_TRANSITIONS, 'resolved', 'in_progress', 'C'),
    ).not.toThrow();
    expect(() =>
      assertTransition(COMPLAINT_TRANSITIONS, 'closed', 'open', 'C'),
    ).toThrow();
    expect(() =>
      assertTransition(COMPLAINT_TRANSITIONS, 'in_progress', 'open', 'C'),
    ).toThrow();
  });
});

describe('time utilities', () => {
  const original = process.env.HOSTEL_UTC_OFFSET_MINUTES;
  afterEach(() => {
    if (original === undefined) delete process.env.HOSTEL_UTC_OFFSET_MINUTES;
    else process.env.HOSTEL_UTC_OFFSET_MINUTES = original;
  });

  it('parseDateOnly accepts real calendar dates only', () => {
    expect(dateOnlyString(parseDateOnly('2026-09-21'))).toBe('2026-09-21');
    expect(() => parseDateOnly('2026-02-31')).toThrow(BadRequestException);
    expect(() => parseDateOnly('21-09-2026')).toThrow(BadRequestException);
    expect(() => parseDateOnly('2026-09-21T10:00:00Z')).toThrow(
      BadRequestException,
    );
  });

  it('parseDateTime rejects garbage', () => {
    expect(() => parseDateTime('tomorrow')).toThrow(BadRequestException);
    expect(parseDateTime('2026-09-21T10:00:00.000Z').toISOString()).toBe(
      '2026-09-21T10:00:00.000Z',
    );
  });

  it('localToday follows HOSTEL_UTC_OFFSET_MINUTES', () => {
    const lateUtc = new Date('2026-09-21T20:00:00Z'); // already 21 Sep 20:00 UTC → 22 Sep 01:30 in IST
    process.env.HOSTEL_UTC_OFFSET_MINUTES = '0';
    expect(dateOnlyString(localToday(lateUtc))).toBe('2026-09-21');
    process.env.HOSTEL_UTC_OFFSET_MINUTES = '330';
    expect(dateOnlyString(localToday(lateUtc))).toBe('2026-09-22');
  });

  it('roll-call windows split the local day into two halves', () => {
    process.env.HOSTEL_UTC_OFFSET_MINUTES = '330';
    const day = parseDateOnly('2026-09-21');
    const { start, end } = dayRange(day);
    expect(start.toISOString()).toBe('2026-09-20T18:30:00.000Z');
    const morning = sessionWindow(day, 'morning');
    const night = sessionWindow(day, 'night');
    expect(morning.start).toEqual(start);
    expect(morning.end).toEqual(night.start);
    expect(night.end).toEqual(end);
  });

  it('academic years must be consecutive', () => {
    expect(isValidAcademicYear('2026-27')).toBe(true);
    expect(isValidAcademicYear('2099-00')).toBe(true);
    expect(isValidAcademicYear('2026-28')).toBe(false);
    expect(isValidAcademicYear('26-27')).toBe(false);
    expect(isValidAcademicYear('2026/27')).toBe(false);
  });
});

describe('billing periods', () => {
  it('monthly: 1st of the month, ends on the last day, labelled YYYY-MM', () => {
    const p = billingPeriodFor('monthly', '2026-02-01');
    expect(dateOnlyString(p.end)).toBe('2026-02-28');
    expect(p.label).toBe('2026-02');
  });

  it('quarterly: calendar quarter boundaries only', () => {
    const p = billingPeriodFor('quarterly', '2026-07-01');
    expect(dateOnlyString(p.end)).toBe('2026-09-30');
    expect(p.label).toBe('2026-Q3');
    expect(() => billingPeriodFor('quarterly', '2026-05-01')).toThrow();
  });

  it('annual: twelve months, labelled with the academic year', () => {
    const p = billingPeriodFor('annual', '2026-06-01');
    expect(dateOnlyString(p.end)).toBe('2027-05-31');
    expect(p.label).toBe('2026-27');
  });

  it('rejects a period that does not start on the 1st', () => {
    expect(() => billingPeriodFor('monthly', '2026-09-15')).toThrow();
  });
});

describe('visitor ID proof protection', () => {
  const original = process.env.HOSTEL_ID_PROOF_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.HOSTEL_ID_PROOF_KEY;
    else process.env.HOSTEL_ID_PROOF_KEY = original;
  });

  it('round-trips and never stores the plain number', () => {
    process.env.HOSTEL_ID_PROOF_KEY = 'unit-test-key';
    const stored = encryptIdProof('1234-5678-9012');
    expect(stored).not.toContain('1234');
    expect(stored.split(':')).toHaveLength(3);
    expect(decryptIdProof(stored)).toBe('1234-5678-9012');
  });

  it('uses a fresh IV each time', () => {
    process.env.HOSTEL_ID_PROOF_KEY = 'unit-test-key';
    expect(encryptIdProof('same')).not.toBe(encryptIdProof('same'));
  });

  it('cannot be decrypted with a different key (tamper / rotation is detected)', () => {
    process.env.HOSTEL_ID_PROOF_KEY = 'key-one';
    const stored = encryptIdProof('secret-id');
    process.env.HOSTEL_ID_PROOF_KEY = 'key-two';
    expect(() => decryptIdProof(stored)).toThrow();
  });

  it('fails closed when no key is configured (no fallback to another secret)', () => {
    delete process.env.HOSTEL_ID_PROOF_KEY;
    expect(() => encryptIdProof('x')).toThrow(InternalServerErrorException);
  });

  it('masks all but the last 4 characters', () => {
    expect(maskIdProof('1234-5678-9012')).toBe('**********9012');
    expect(maskIdProof('abc')).toBe('***');
  });
});

describe('query helpers', () => {
  it('enumParam returns a valid value, ignores blanks and rejects unknowns with a 400', () => {
    expect(enumParam('night', ['morning', 'night'] as const, 'session')).toBe(
      'night',
    );
    expect(enumParam(undefined, ['a'] as const, 'x')).toBeUndefined();
    expect(enumParam('', ['a'] as const, 'x')).toBeUndefined();
    expect(() =>
      enumParam('noon', ['morning', 'night'] as const, 'session'),
    ).toThrow(BadRequestException);
  });

  it('CSV export neutralises spreadsheet formula injection and quotes delimiters', () => {
    const csv = toCsv([{ name: '=cmd|calc', note: 'a,b "c"' }]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('name,note');
    expect(row).toBe('\'=cmd|calc,"a,b ""c"""');
  });
});
