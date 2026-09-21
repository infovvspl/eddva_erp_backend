/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { DisciplineService } from './discipline.service';
import { VisitorsService } from '../visitors/visitors.service';
import { MessAttendanceService } from '../mess/mess-attendance.service';
import { MessMenuService } from '../mess/mess-menu.service';

const actor = {
  eddva_user_id: 'w1',
  institute_id: 'inst-1',
  user_name: 'Wanda',
  user_role: 'Warden',
  is_institute_admin: false,
};
const today = () => new Date().toISOString().slice(0, 10);

describe('DisciplineService', () => {
  const db = {
    hostelDisciplineRecord: { create: jest.fn(), update: jest.fn() },
  };
  const lookup = { resident: jest.fn(), gatePass: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new DisciplineService(
    db as never,
    lookup as never,
    audit as never,
  );
  const dto = {
    incident_date: '2020-01-01',
    category: 'curfew_violation' as const,
    description: 'Late',
    action_taken: 'warning' as const,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    lookup.resident.mockResolvedValue({ resident_id: 7 });
    db.hostelDisciplineRecord.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ record_id: 1, ...data }),
    );
    db.hostelDisciplineRecord.update.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ record_id: 1, ...data }),
    );
  });

  it('creates a record and audits it', async () => {
    await service.create(actor, 7, dto);
    expect(
      db.hostelDisciplineRecord.create.mock.calls[0][0].data,
    ).toMatchObject({ resident_id: 7, recorded_by: 'w1' });
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'create' }),
    );
  });

  it('a linked gate pass must belong to the same resident', async () => {
    lookup.gatePass.mockResolvedValue({ gate_pass_id: 5, resident_id: 99 });
    await expect(
      service.create(actor, 7, { ...dto, gate_pass_id: 5 }),
    ).rejects.toMatchObject({
      response: { error: 'GATE_PASS_RESIDENT_MISMATCH' },
    });
    expect(db.hostelDisciplineRecord.create).not.toHaveBeenCalled();
  });

  it('links the resident’s own gate pass', async () => {
    lookup.gatePass.mockResolvedValue({ gate_pass_id: 5, resident_id: 7 });
    await service.create(actor, 7, { ...dto, gate_pass_id: 5 });
    expect(
      db.hostelDisciplineRecord.create.mock.calls[0][0].data.gate_pass_id,
    ).toBe(5);
  });

  it('a fine needs an amount; other actions must not carry one', async () => {
    await expect(
      service.create(actor, 7, { ...dto, action_taken: 'fine' }),
    ).rejects.toMatchObject({
      response: { error: 'FINE_AMOUNT_REQUIRED' },
    });
    await expect(
      service.create(actor, 7, { ...dto, fine_amount: 50 }),
    ).rejects.toMatchObject({
      response: { error: 'FINE_AMOUNT_NOT_ALLOWED' },
    });
    await expect(
      service.create(actor, 7, {
        ...dto,
        action_taken: 'fine',
        fine_amount: 50,
      }),
    ).resolves.toBeDefined();
  });

  it('an incident cannot be dated in the future', async () => {
    await expect(
      service.create(actor, 7, { ...dto, incident_date: '2999-01-01' }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_INCIDENT_DATE' },
    });
  });

  it('a record can later be linked to a gate pass of the same resident (and audited)', async () => {
    db.hostelDisciplineRecord.create.mockReset();
    (
      db.hostelDisciplineRecord as unknown as { findFirst: jest.Mock }
    ).findFirst = jest
      .fn()
      .mockResolvedValue({ record_id: 1, resident_id: 7, gate_pass_id: null });
    lookup.gatePass.mockResolvedValue({ gate_pass_id: 5, resident_id: 7 });
    await service.linkGatePass(actor, 1, 5);
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'link_gate_pass', newStatus: '5' }),
    );
  });
});

describe('VisitorsService (sensitive ID handling)', () => {
  const OLD_KEY = process.env.HOSTEL_ID_PROOF_KEY;
  beforeAll(() => (process.env.HOSTEL_ID_PROOF_KEY = 'unit-test-key'));
  afterAll(() => {
    if (OLD_KEY === undefined) delete process.env.HOSTEL_ID_PROOF_KEY;
    else process.env.HOSTEL_ID_PROOF_KEY = OLD_KEY;
  });

  const db = {
    hostelVisitorLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const lookup = { resident: jest.fn() };
  const access = { hasPermission: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new VisitorsService(
    db as never,
    lookup as never,
    access as never,
    audit as never,
  );
  const dto = {
    resident_id: 7,
    visitor_name: 'Rakesh',
    relation: 'Father',
    id_proof_number: '1234-5678-9012',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    lookup.resident.mockResolvedValue({ resident_id: 7, status: 'active' });
    db.hostelVisitorLog.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({
          visitor_log_id: 1,
          ...data,
          resident: { resident_id: 7 },
        }),
    );
  });

  it('stores the ID encrypted + masked and never returns the encrypted blob', async () => {
    access.hasPermission.mockResolvedValue(false);
    const result = await service.create(actor, dto);
    const stored = db.hostelVisitorLog.create.mock.calls[0][0].data;
    expect(stored.id_proof_encrypted).not.toContain('1234');
    expect(stored.id_proof_masked).toBe('**********9012');
    expect(result).not.toHaveProperty('id_proof_encrypted');
    expect(result).not.toHaveProperty('id_proof_number');
  });

  it('reveals the full number only to holders of visitors:view_id', async () => {
    access.hasPermission.mockResolvedValue(true);
    const result = await service.create(actor, dto);
    expect(access.hasPermission).toHaveBeenCalledWith(
      actor,
      'visitors',
      'view_id',
    );
    expect((result as { id_proof_number?: string }).id_proof_number).toBe(
      '1234-5678-9012',
    );
  });

  it('keeps the ID number out of the audit trail', async () => {
    access.hasPermission.mockResolvedValue(false);
    await service.create(actor, dto);
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('1234-5678');
  });

  it('a vacated resident cannot receive visitors on record', async () => {
    lookup.resident.mockResolvedValue({ resident_id: 7, status: 'vacated' });
    await expect(service.create(actor, dto)).rejects.toMatchObject({
      response: { error: 'RESIDENT_NOT_ACTIVE' },
    });
  });

  it('a visitor can be checked out only once', async () => {
    access.hasPermission.mockResolvedValue(false);
    db.hostelVisitorLog.findFirst.mockResolvedValue({
      visitor_log_id: 1,
      in_time: new Date(Date.now() - 1000),
      id_proof_encrypted: null,
      resident: {},
    });
    db.hostelVisitorLog.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.checkout(actor, 1)).rejects.toMatchObject({
      status: 409,
      response: { error: 'VISITOR_ALREADY_CHECKED_OUT' },
    });
    expect(db.hostelVisitorLog.updateMany.mock.calls[0][0].where).toMatchObject(
      { out_time: null },
    );
  });
});

describe('Mess', () => {
  const db = {
    hostelMessAttendance: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    hostelResident: { findMany: jest.fn(), count: jest.fn() },
    hostelMessMenu: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const lookup = { resident: jest.fn() };
  const audit = { log: jest.fn() };
  const attendance = new MessAttendanceService(
    db as never,
    lookup as never,
    audit as never,
  );
  const menu = new MessMenuService(db as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    lookup.resident.mockResolvedValue({ resident_id: 1, status: 'active' });
    db.hostelMessAttendance.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({ mess_attendance_id: 1, ...data }),
    );
  });

  it('consumed/missed cannot be recorded for a future meal, opt-in/out can', async () => {
    const base = {
      resident_id: 1,
      meal_date: '2999-01-01',
      meal_type: 'lunch' as const,
    };
    await expect(
      attendance.mark(actor, { ...base, status: 'consumed' }),
    ).rejects.toMatchObject({
      response: { error: 'MEAL_DATE_IN_FUTURE' },
    });
    await expect(
      attendance.mark(actor, { ...base, status: 'opted_in' }),
    ).resolves.toBeDefined();
  });

  it('meals are tracked for active residents only', async () => {
    lookup.resident.mockResolvedValue({ resident_id: 1, status: 'suspended' });
    await expect(
      attendance.mark(actor, {
        resident_id: 1,
        meal_type: 'lunch',
        status: 'opted_in',
        meal_date: today(),
      }),
    ).rejects.toMatchObject({ response: { error: 'RESIDENT_NOT_ACTIVE' } });
  });

  it('bulk meal attendance is all-or-nothing on existing records', async () => {
    db.hostelResident.findMany.mockResolvedValue([
      { resident_id: 1, status: 'active' },
      { resident_id: 2, status: 'active' },
    ]);
    db.hostelMessAttendance.findMany.mockResolvedValue([{ resident_id: 2 }]);
    await expect(
      attendance.bulk(actor, {
        meal_date: today(),
        meal_type: 'dinner',
        entries: [
          { resident_id: 1, status: 'consumed' },
          { resident_id: 2, status: 'consumed' },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.hostelMessAttendance.createMany).not.toHaveBeenCalled();
  });

  it('summary: expected meals = active residents − opted out, and consumption rate = consumed / (consumed + missed)', async () => {
    db.hostelMessAttendance.groupBy.mockResolvedValue([
      { meal_type: 'lunch', status: 'opted_out', _count: { _all: 2 } },
      { meal_type: 'lunch', status: 'consumed', _count: { _all: 6 } },
      { meal_type: 'lunch', status: 'missed', _count: { _all: 2 } },
    ]);
    db.hostelResident.count.mockResolvedValue(20);
    const result = await attendance.summary('inst-1', {
      date: today(),
      meal_type: 'lunch',
    });
    expect(result.by_meal[0]).toMatchObject({
      meal_type: 'lunch',
      expected_meals: 18,
      consumption_rate: 75,
    });
  });

  describe('menu', () => {
    it('a duplicate day + meal + effective date is a 409', async () => {
      db.hostelMessMenu.findUnique.mockResolvedValue({ menu_id: 1 });
      await expect(
        menu.create(actor, {
          day_of_week: 'monday',
          meal_type: 'lunch',
          items: ['Dal'],
          effective_from: '2026-09-01',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('the weekly menu uses the latest menu effective on the date for each slot', async () => {
      db.hostelMessMenu.findMany.mockResolvedValue([
        {
          day_of_week: 'monday',
          meal_type: 'lunch',
          items: ['Idli'],
          effective_from: new Date('2026-06-01'),
        },
        {
          day_of_week: 'monday',
          meal_type: 'lunch',
          items: ['Poha'],
          effective_from: new Date('2026-01-01'),
        },
      ]);
      const week = await menu.weekly('inst-1', '2026-09-21');
      const monday = week.days.find((d) => d.day_of_week === 'monday')!;
      expect((monday.meals.lunch as { items: string[] }).items).toEqual([
        'Idli',
      ]);
      expect(monday.meals.dinner).toBeNull();
      const where = db.hostelMessMenu.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        is_active: true,
        effective_from: { lte: new Date('2026-09-21') },
      });
    });
  });
});
