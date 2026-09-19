import { BadRequestException } from '@nestjs/common';
import { toCsv } from './csv.util';
import {
  buildDateRange,
  buildMeta,
  parseDateParam,
  parsePagination,
  parseSort,
} from './pagination.util';
import { AdmissionNumberingService } from './admission-numbering.service';

describe('pagination.util', () => {
  it('clamps limit and tolerates junk page/limit (previously a 500 elsewhere)', () => {
    expect(parsePagination({ page: -3, limit: 100000 })).toMatchObject({
      page: 1,
      limit: 200,
      skip: 0,
    });
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toMatchObject({
      page: 1,
      limit: 20,
    });
    expect(parsePagination({ page: 3, limit: 10 })).toMatchObject({
      skip: 20,
      take: 10,
    });
  });

  it('whitelists sort fields', () => {
    expect(
      parseSort('foo', ['name', 'created_at'] as const, 'created_at'),
    ).toBe('created_at');
    expect(
      parseSort('name', ['name', 'created_at'] as const, 'created_at'),
    ).toBe('name');
  });

  it('builds pagination meta', () => {
    expect(buildMeta(45, 2, 20)).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
    });
    expect(buildMeta(0, 1, 20).totalPages).toBe(1);
  });

  it('a date-only "to" includes the whole day; garbage is a 400', () => {
    const to = parseDateParam('2027-03-31', 'to', true)!;
    expect(to.toISOString()).toBe('2027-03-31T23:59:59.999Z');
    expect(() => parseDateParam('garbage', 'from')).toThrow(
      BadRequestException,
    );
    expect(() => buildDateRange('2027-04-01', '2027-03-01')).toThrow(
      BadRequestException,
    );
    expect(buildDateRange(undefined, undefined)).toBeUndefined();
  });
});

describe('toCsv', () => {
  it('escapes quotes/commas/newlines', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }])).toBe(
      'a,b,c\r\n"x,y","say ""hi""","l1\nl2"',
    );
  });

  it('neutralises spreadsheet formula injection', () => {
    const csv = toCsv([{ name: '=HYPERLINK("http://evil")', n: 5 }]);
    expect(csv.split('\r\n')[1]).toMatch(/^"'=HYPERLINK/);
  });

  it('renders null/undefined as empty and dates as ISO', () => {
    expect(
      toCsv([{ a: null, b: undefined, d: new Date('2027-01-02T03:04:05Z') }]),
    ).toBe('a,b,d\r\n,,2027-01-02T03:04:05.000Z');
  });
});

describe('AdmissionNumberingService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw };
  const service = new AdmissionNumberingService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('uses an April–March financial year', () => {
    expect(service.getFinancialYear(new Date(2027, 3, 1))).toBe('2027-28');
    expect(service.getFinancialYear(new Date(2027, 2, 31))).toBe('2026-27');
  });

  it('zero-pads the atomically incremented sequence', async () => {
    queryRaw.mockResolvedValue([
      { current_number: 42, prefix: 'APP/2027-28/' },
    ]);
    await expect(
      service.next('APPLICATION', undefined, new Date(2027, 5, 1)),
    ).resolves.toBe('APP/2027-28/00042');
  });

  it('runs on the supplied transaction client so a rollback also rolls back the number', async () => {
    const txQuery = jest
      .fn()
      .mockResolvedValue([{ current_number: 1, prefix: 'ENR/2027-28/' }]);
    await service.next(
      'ENROLLMENT',
      { $queryRaw: txQuery } as never,
      new Date(2027, 5, 1),
    );
    expect(txQuery).toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
