/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Prisma } from '@prisma/client';
import { GatePassesService } from './gate-passes.service';

const actor = {
  eddva_user_id: 'g1',
  institute_id: 'inst-1',
  user_name: 'Gary Gate',
  user_role: 'Gate Security',
  is_institute_admin: false,
};
const MIN = 60 * 1000;

const residentRow = {
  resident_id: 7,
  student_name: 'Aarav',
  admission_no: 'ADM-7',
  gender: 'male',
  grade: '9',
  guardian_name: 'Rakesh',
  guardian_phone: '+91 9876543210',
  guardian_email: 'r@x.io',
  status: 'active',
};
const pass = (over: Record<string, unknown> = {}) => ({
  gate_pass_id: 1,
  institute_id: 'inst-1',
  pass_no: 'HGP/2026-27/00001',
  resident_id: 7,
  status: 'approved',
  requested_out_at: new Date(Date.now() - 10 * MIN),
  expected_return_at: new Date(Date.now() + 90 * MIN),
  actual_out_at: null,
  actual_return_at: null,
  resident: residentRow,
  ...over,
});

describe('GatePassesService', () => {
  const db = {
    hostelGatePass: {
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    hostelRoomAllotment: { findFirst: jest.fn() },
    hostelResident: { findMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const lookup = {
    lockGatePass: jest.fn(),
    lockResident: jest.fn(),
    resident: jest.fn(),
  };
  const numbering = { next: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyGuardian: jest.fn(), notifyStaff: jest.fn() };
  const service = new GatePassesService(
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
    lookup.lockResident.mockResolvedValue({ ...residentRow });
    lookup.resident.mockResolvedValue({ ...residentRow });
    lookup.lockGatePass.mockImplementation(() => Promise.resolve(pass()));
    db.hostelGatePass.findFirstOrThrow.mockImplementation(() =>
      Promise.resolve(pass()),
    );
    db.hostelGatePass.updateMany.mockResolvedValue({ count: 1 });
    db.hostelGatePass.findMany.mockResolvedValue([]);
    db.hostelRoomAllotment.findFirst.mockResolvedValue(null);
    numbering.next.mockResolvedValue('HGP/2026-27/00001');
  });

  describe('create', () => {
    const dto = {
      resident_id: 7,
      pass_type: 'day_outing' as const,
      reason: 'Dentist',
      destination: 'Clinic',
      requested_out_at: new Date(Date.now() + 5 * MIN).toISOString(),
      expected_return_at: new Date(Date.now() + 125 * MIN).toISOString(),
    };

    it('creates a pending pass with a generated number', async () => {
      db.hostelGatePass.create.mockImplementation(
        ({ data }: { data: object }) =>
          Promise.resolve({ ...pass(), ...data, status: 'pending' }),
      );
      const result = await service.create(actor, dto);
      expect(numbering.next).toHaveBeenCalledWith('GATE_PASS', db);
      expect(result.status).toBe('pending');
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ action: 'create' }),
      );
    });

    it('rejects a window that ends before it starts', async () => {
      await expect(
        service.create(actor, {
          ...dto,
          expected_return_at: new Date(Date.now() - MIN).toISOString(),
        }),
      ).rejects.toMatchObject({ response: { error: 'INVALID_PASS_WINDOW' } });
    });

    it('rejects a start time in the past', async () => {
      await expect(
        service.create(actor, {
          ...dto,
          requested_out_at: new Date(Date.now() - 3 * 60 * MIN).toISOString(),
          expected_return_at: new Date(Date.now() + 60 * MIN).toISOString(),
        }),
      ).rejects.toMatchObject({ response: { error: 'INVALID_PASS_WINDOW' } });
    });

    it('a day outing cannot exceed 24 hours', async () => {
      await expect(
        service.create(actor, {
          ...dto,
          expected_return_at: new Date(
            Date.now() + 30 * 60 * MIN,
          ).toISOString(),
        }),
      ).rejects.toMatchObject({ response: { error: 'INVALID_PASS_WINDOW' } });
    });

    it('a suspended resident cannot get a pass', async () => {
      lookup.lockResident.mockResolvedValue({
        ...residentRow,
        status: 'suspended',
      });
      await expect(service.create(actor, dto)).rejects.toMatchObject({
        response: { error: 'RESIDENT_NOT_ACTIVE' },
      });
    });

    it('refuses a pass that overlaps an open one (409 GATE_PASS_CONFLICT)', async () => {
      db.hostelGatePass.findMany.mockResolvedValue([
        { gate_pass_id: 3, pass_no: 'HGP/3', status: 'approved' },
      ]);
      await expect(service.create(actor, dto)).rejects.toMatchObject({
        status: 409,
        response: { error: 'GATE_PASS_CONFLICT' },
      });
      expect(db.hostelGatePass.create).not.toHaveBeenCalled();
    });
  });

  describe('scan-out — gate scanning is the source of truth for exit', () => {
    it('a resident cannot leave on an unapproved (pending) pass', async () => {
      lookup.lockGatePass.mockResolvedValue(pass({ status: 'pending' }));
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'PASS_NOT_APPROVED' },
      });
      expect(db.hostelGatePass.updateMany).not.toHaveBeenCalled();
    });

    it.each(['rejected', 'cancelled', 'returned', 'expired'])(
      'an invalid (%s) pass cannot be used to leave',
      async (status) => {
        lookup.lockGatePass.mockResolvedValue(pass({ status }));
        await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
          response: { error: 'PASS_NOT_VALID' },
        });
      },
    );

    it('cannot scan out twice (409 ALREADY_SCANNED_OUT)', async () => {
      lookup.lockGatePass.mockResolvedValue(
        pass({ status: 'out', actual_out_at: new Date() }),
      );
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        status: 409,
        response: { error: 'ALREADY_SCANNED_OUT' },
      });
    });

    it('an unrelated pass is refused when the scanned resident does not match (403)', async () => {
      await expect(
        service.scanOut(actor, 1, { resident_id: 99 }),
      ).rejects.toMatchObject({
        status: 403,
        response: { error: 'PASS_RESIDENT_MISMATCH' },
      });
      await expect(
        service.scanOut(actor, 1, { admission_no: 'ADM-OTHER' }),
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    it('only an active resident can leave', async () => {
      lookup.lockResident.mockResolvedValue({
        ...residentRow,
        status: 'suspended',
      });
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'RESIDENT_NOT_ACTIVE' },
      });
    });

    it('a pass whose window has ended is marked expired and the exit is refused', async () => {
      lookup.lockGatePass.mockResolvedValue(
        pass({ expected_return_at: new Date(Date.now() - MIN) }),
      );
      db.hostelGatePass.findFirstOrThrow.mockResolvedValue(
        pass({ expected_return_at: new Date(Date.now() - MIN) }),
      );
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'PASS_EXPIRED' },
      });
      expect(db.hostelGatePass.update).toHaveBeenCalledWith({
        where: { gate_pass_id: 1 },
        data: { status: 'expired' },
      });
      expect(db.hostelGatePass.updateMany).not.toHaveBeenCalled();
    });

    it('cannot be used long before its start time', async () => {
      const future = pass({
        requested_out_at: new Date(Date.now() + 180 * MIN),
      });
      lookup.lockGatePass.mockResolvedValue(future);
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'PASS_NOT_YET_VALID' },
      });
    });

    it('records the actual out time and gate user, then audits and notifies the guardian', async () => {
      db.hostelGatePass.findFirstOrThrow
        .mockResolvedValueOnce(pass())
        .mockResolvedValueOnce(
          pass({
            status: 'out',
            actual_out_at: new Date(),
            scanned_out_by: 'g1',
          }),
        );
      const result = await service.scanOut(actor, 1, {
        resident_id: 7,
        admission_no: 'adm-7',
      });
      expect(db.hostelGatePass.updateMany).toHaveBeenCalledWith({
        where: { gate_pass_id: 1, status: 'approved' }, // conditional claim: only one scan can win
        data: expect.objectContaining({
          status: 'out',
          scanned_out_by: 'g1',
          actual_out_at: expect.any(Date),
        }),
      });
      expect(result.status).toBe('out');
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ action: 'scan_out', newStatus: 'out' }),
      );
      expect(notifications.notifyGuardian).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'resident_exited' }),
        expect.anything(),
      );
    });

    it('a concurrent scan that lost the claim gets a 409', async () => {
      db.hostelGatePass.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        status: 409,
        response: { error: 'ALREADY_SCANNED_OUT' },
      });
    });

    it('the database backstop (one open pass per resident) surfaces as 409 RESIDENT_ALREADY_OUT', async () => {
      db.hostelGatePass.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '6',
        }),
      );
      await expect(service.scanOut(actor, 1, {})).rejects.toMatchObject({
        status: 409,
        response: { error: 'RESIDENT_ALREADY_OUT' },
      });
    });
  });

  describe('scan-in', () => {
    it('cannot scan in before being scanned out (approved pass)', async () => {
      lookup.lockGatePass.mockResolvedValue(pass({ status: 'approved' }));
      await expect(service.scanIn(actor, 1, {})).rejects.toMatchObject({
        response: { error: 'NOT_SCANNED_OUT' },
      });
    });

    it('cannot scan in twice', async () => {
      lookup.lockGatePass.mockResolvedValue(
        pass({ status: 'returned', actual_return_at: new Date() }),
      );
      await expect(service.scanIn(actor, 1, {})).rejects.toMatchObject({
        status: 409,
        response: { error: 'ALREADY_SCANNED_IN' },
      });
    });

    it('cannot scan in using an unrelated pass', async () => {
      lookup.lockGatePass.mockResolvedValue(
        pass({ status: 'out', actual_out_at: new Date() }),
      );
      await expect(
        service.scanIn(actor, 1, { resident_id: 99 }),
      ).rejects.toMatchObject({
        response: { error: 'PASS_RESIDENT_MISMATCH' },
      });
    });

    it('closes an OVERDUE pass, records the return and reports how late', async () => {
      const late = pass({
        status: 'overdue',
        actual_out_at: new Date(Date.now() - 200 * MIN),
        expected_return_at: new Date(Date.now() - 90 * MIN),
      });
      lookup.lockGatePass.mockResolvedValue(late);
      db.hostelGatePass.findFirstOrThrow.mockResolvedValue({
        ...late,
        status: 'returned',
        actual_return_at: new Date(),
      });
      const result = await service.scanIn(actor, 1, {});
      expect(db.hostelGatePass.updateMany).toHaveBeenCalledWith({
        where: {
          gate_pass_id: 1,
          status: { in: ['out', 'overdue'] },
          actual_return_at: null,
        },
        data: expect.objectContaining({
          status: 'returned',
          scanned_in_by: 'g1',
        }),
      });
      expect(result.returned_late).toBe(true);
      expect(result.late_by_minutes).toBeGreaterThanOrEqual(89);
      expect(notifications.notifyGuardian).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'resident_returned' }),
        expect.anything(),
      );
    });
  });

  describe('approve / reject', () => {
    it('cannot approve a pass that is not pending', async () => {
      lookup.lockGatePass.mockResolvedValue(pass({ status: 'rejected' }));
      await expect(service.approve(actor, 1)).rejects.toMatchObject({
        status: 409,
        response: { error: 'INVALID_STATE_TRANSITION' },
      });
    });

    it('cannot approve a pass whose window is already over', async () => {
      lookup.lockGatePass.mockResolvedValue(
        pass({
          status: 'pending',
          expected_return_at: new Date(Date.now() - MIN),
        }),
      );
      await expect(service.approve(actor, 1)).rejects.toMatchObject({
        response: { error: 'PASS_WINDOW_ELAPSED' },
      });
    });

    it('a used pass cannot be cancelled', async () => {
      lookup.lockGatePass.mockResolvedValue(pass({ status: 'out' }));
      await expect(service.cancel(actor, 1)).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('overdue detection', () => {
    it('only touches passes that are OUT with no actual return, and past their return time', async () => {
      db.$queryRaw.mockResolvedValue([]);
      await service.markOverduePasses(new Date());
      const sql = (db.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toContain("WHERE status = 'out'");
      expect(sql).toContain('actual_return_at IS NULL');
      expect(sql).toContain('expected_return_at <');
    });

    it('processes nothing (no alerts, no audit) when nothing is overdue — safe to re-run', async () => {
      db.$queryRaw.mockResolvedValue([]);
      await expect(service.markOverduePasses()).resolves.toBe(0);
      expect(notifications.notifyStaff).not.toHaveBeenCalled();
      expect(notifications.notifyGuardian).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('records audit, notifies the block warden + admin channel and the guardian for each newly overdue pass', async () => {
      const expected = new Date(Date.now() - 45 * MIN);
      db.$queryRaw.mockResolvedValue([
        {
          gate_pass_id: 1,
          institute_id: 'inst-1',
          resident_id: 7,
          pass_no: 'HGP/1',
          expected_return_at: expected,
        },
      ]);
      db.hostelResident.findMany.mockResolvedValue([
        {
          resident_id: 7,
          student_name: 'Aarav',
          guardian_phone: '+91 98',
          guardian_email: null,
          allotments: [{ room: { block: { warden_user_id: 'w1' } } }],
        },
      ]);
      await expect(service.markOverduePasses(new Date())).resolves.toBe(1);
      expect(audit.log).toHaveBeenCalledWith(
        undefined, // system actor
        expect.objectContaining({
          action: 'mark_overdue',
          oldStatus: 'out',
          newStatus: 'overdue',
        }),
      );
      expect(notifications.notifyStaff).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'gate_pass_overdue' }),
        ['w1', null],
      );
      expect(notifications.notifyGuardian).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'gate_pass_overdue' }),
        expect.objectContaining({ guardian_phone: '+91 98' }),
      );
    });

    it('expiring unused passes never raises an overdue alert', async () => {
      db.$queryRaw.mockResolvedValue([{ gate_pass_id: 2, status: 'approved' }]);
      await expect(service.expireUnusedPasses()).resolves.toBe(1);
      expect(notifications.notifyStaff).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ newStatus: 'expired' }),
      );
    });
  });

  it('flags an out pass as overdue live, before the sweep has run', async () => {
    db.hostelGatePass.findFirstOrThrow.mockReset();
    db.hostelGatePass.findMany.mockReset();
    // decorate() is exercised through findOne
    const row = pass({
      status: 'out',
      actual_out_at: new Date(Date.now() - 200 * MIN),
      expected_return_at: new Date(Date.now() - 30 * MIN),
    });
    (
      db as unknown as { hostelGatePass: { findFirst: jest.Mock } }
    ).hostelGatePass.findFirst = jest.fn().mockResolvedValue(row);
    const result = await service.findOne('inst-1', 1);
    expect(result.is_overdue).toBe(true);
    expect(result.overdue_by_minutes).toBeGreaterThanOrEqual(29);
  });
});
