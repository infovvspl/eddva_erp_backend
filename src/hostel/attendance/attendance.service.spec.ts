/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Prisma } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { dateOnlyString, localToday, sessionWindow } from '../common/time.util';

const actor = {
  eddva_user_id: 'w1',
  institute_id: 'inst-1',
  user_name: 'Wanda',
  user_role: 'Warden',
  is_institute_admin: false,
};
const dupError = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: '6',
  });

describe('AttendanceService', () => {
  const db = {
    hostelAttendance: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    hostelResident: { findMany: jest.fn() },
    hostelGatePass: { findMany: jest.fn() },
  };
  const lookup = { resident: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notifyStaff: jest.fn() };
  const service = new AttendanceService(
    db as never,
    lookup as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    lookup.resident.mockResolvedValue({ resident_id: 1, status: 'active' });
    db.hostelAttendance.findMany.mockResolvedValue([]);
    db.hostelGatePass.findMany.mockResolvedValue([]);
    db.hostelAttendance.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ attendance_id: 9, ...data }),
    );
  });

  describe('mark', () => {
    const dto = {
      resident_id: 1,
      session: 'morning' as const,
      status: 'present' as const,
    };

    it('marks a resident and audits it', async () => {
      const row = await service.mark(actor, dto);
      expect(row).toMatchObject({
        resident_id: 1,
        session: 'morning',
        status: 'present',
        marked_by: 'w1',
      });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({ action: 'mark' }),
      );
    });

    it('prevents a duplicate resident/date/session (409)', async () => {
      db.hostelAttendance.create.mockRejectedValue(dupError());
      await expect(service.mark(actor, dto)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('roll call covers active residents only', async () => {
      lookup.resident.mockResolvedValue({ resident_id: 1, status: 'vacated' });
      await expect(service.mark(actor, dto)).rejects.toMatchObject({
        response: { error: 'RESIDENT_NOT_ACTIVE' },
      });
      expect(db.hostelAttendance.create).not.toHaveBeenCalled();
    });

    it('cannot be marked for a future date', async () => {
      await expect(
        service.mark(actor, { ...dto, attendance_date: '2999-01-01' }),
      ).rejects.toMatchObject({
        response: { error: 'ATTENDANCE_DATE_IN_FUTURE' },
      });
    });

    it('an absence with no gate pass raises a warden/admin alert', async () => {
      db.hostelAttendance.findMany.mockResolvedValueOnce([
        {
          attendance_id: 9,
          institute_id: 'inst-1',
          resident_id: 1,
          attendance_date: localToday(),
          session: 'morning',
          resident: {
            student_name: 'Aarav',
            allotments: [{ room: { block: { warden_user_id: 'w1' } } }],
          },
        },
      ]);
      db.hostelAttendance.updateMany.mockResolvedValue({ count: 1 });
      await service.mark(actor, { ...dto, status: 'absent' });
      expect(notifications.notifyStaff).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'unaccounted_absence' }),
        ['w1', null],
      );
    });
  });

  describe('bulk', () => {
    const entries = [
      { resident_id: 1, status: 'present' as const },
      { resident_id: 2, status: 'absent' as const },
    ];

    it('rejects the same resident twice in one request', async () => {
      await expect(
        service.bulk(actor, {
          session: 'night',
          entries: [entries[0], entries[0]],
        }),
      ).rejects.toMatchObject({
        status: 400,
        response: { error: 'DUPLICATE_ENTRIES' },
      });
    });

    it('is all-or-nothing when a resident is unknown', async () => {
      db.hostelResident.findMany.mockResolvedValue([
        { resident_id: 1, status: 'active' },
      ]);
      await expect(
        service.bulk(actor, { session: 'night', entries }),
      ).rejects.toMatchObject({
        status: 404,
        response: { details: { resident_ids: [2] } },
      });
      expect(db.hostelAttendance.createMany).not.toHaveBeenCalled();
    });

    it('is all-or-nothing when a resident is inactive', async () => {
      db.hostelResident.findMany.mockResolvedValue([
        { resident_id: 1, status: 'active' },
        { resident_id: 2, status: 'suspended' },
      ]);
      await expect(
        service.bulk(actor, { session: 'night', entries }),
      ).rejects.toMatchObject({
        response: {
          error: 'RESIDENT_NOT_ACTIVE',
          details: { resident_ids: [2] },
        },
      });
      expect(db.hostelAttendance.createMany).not.toHaveBeenCalled();
    });

    it('refuses when any resident already has a record for that date/session (409)', async () => {
      db.hostelResident.findMany.mockResolvedValue([
        { resident_id: 1, status: 'active' },
        { resident_id: 2, status: 'active' },
      ]);
      db.hostelAttendance.findMany.mockResolvedValueOnce([{ resident_id: 2 }]);
      await expect(
        service.bulk(actor, { session: 'night', entries }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          error: 'ATTENDANCE_ALREADY_MARKED',
          details: { resident_ids: [2] },
        },
      });
      expect(db.hostelAttendance.createMany).not.toHaveBeenCalled();
    });

    it('saves the whole roll call and reports the tally', async () => {
      db.hostelResident.findMany.mockResolvedValue([
        { resident_id: 1, status: 'active' },
        { resident_id: 2, status: 'active' },
      ]);
      db.hostelAttendance.findMany.mockResolvedValue([]);
      db.hostelAttendance.createMany.mockResolvedValue({ count: 2 });
      const result = await service.bulk(actor, { session: 'night', entries });
      expect(result).toMatchObject({
        created: 2,
        present: 1,
        absent: 1,
        on_leave: 0,
      });
      expect(db.hostelAttendance.createMany.mock.calls[0][0].data).toHaveLength(
        2,
      );
    });
  });

  describe('update', () => {
    it('audits the old and new status of a correction', async () => {
      db.hostelAttendance.findFirst.mockResolvedValue({
        attendance_id: 9,
        resident_id: 1,
        status: 'present',
        attendance_date: localToday(),
        session: 'night',
      });
      db.hostelAttendance.update.mockResolvedValue({
        attendance_id: 9,
        status: 'on_leave',
      });
      await service.update(actor, 9, { status: 'on_leave' });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'update',
          oldStatus: 'present',
          newStatus: 'on_leave',
        }),
      );
    });
  });

  describe('unaccounted absences', () => {
    const day = localToday();
    const absent = (
      id: number,
      residentId: number,
      session: 'morning' | 'night' = 'night',
    ) => ({
      attendance_id: id,
      institute_id: 'inst-1',
      resident_id: residentId,
      attendance_date: day,
      session,
      status: 'absent',
      resident: {
        resident_id: residentId,
        student_name: `R${residentId}`,
        admission_no: null,
        guardian_name: 'G',
        guardian_phone: '1',
        allotments: [],
      },
    });

    it('an absence with no pass is unaccounted', async () => {
      db.hostelAttendance.findMany.mockResolvedValue([absent(1, 1)]);
      const rows = await service.unaccountedAll('inst-1', {
        date: dateOnlyString(day),
      });
      expect(rows.map((r) => r.resident_id)).toEqual([1]);
    });

    it('a gate-verified pass covering the session explains the absence', async () => {
      const { start } = sessionWindow(day, 'night');
      db.hostelAttendance.findMany.mockResolvedValue([
        absent(1, 1),
        absent(2, 2),
      ]);
      db.hostelGatePass.findMany.mockResolvedValue([
        {
          gate_pass_id: 5,
          pass_no: 'HGP/5',
          status: 'out',
          resident_id: 1,
          actual_out_at: new Date(start.getTime() + 60 * 60 * 1000),
          actual_return_at: null,
        },
      ]);
      const rows = await service.unaccountedAll('inst-1', {
        date: dateOnlyString(day),
      });
      expect(rows.map((r) => r.resident_id)).toEqual([2]); // resident 1 was verifiably outside
    });

    it('a pass that returned before the session began does not explain it', async () => {
      const { start } = sessionWindow(day, 'night');
      db.hostelAttendance.findMany.mockResolvedValue([absent(1, 1)]);
      db.hostelGatePass.findMany.mockResolvedValue([
        {
          gate_pass_id: 5,
          pass_no: 'HGP/5',
          status: 'returned',
          resident_id: 1,
          actual_out_at: new Date(start.getTime() - 5 * 60 * 60 * 1000),
          actual_return_at: new Date(start.getTime() - 60 * 60 * 1000),
        },
      ]);
      const rows = await service.unaccountedAll('inst-1', {
        date: dateOnlyString(day),
      });
      expect(rows).toHaveLength(1);
    });

    it('only passes that were actually scanned out are considered (approved-but-unused never explains an absence)', async () => {
      db.hostelAttendance.findMany.mockResolvedValue([absent(1, 1)]);
      await service.unaccountedAll('inst-1', { date: dateOnlyString(day) });
      const where = db.hostelGatePass.findMany.mock.calls[0][0].where;
      expect(where.actual_out_at.not).toBeNull();
    });

    it('the alert API paginates in the standard list shape', async () => {
      db.hostelAttendance.findMany.mockResolvedValue([
        absent(1, 1),
        absent(2, 2),
        absent(3, 3),
      ]);
      const page = await service.unaccountedAbsences('inst-1', { limit: 2 });
      expect(page.data).toHaveLength(2);
      expect(page.pagination).toMatchObject({
        total: 3,
        limit: 2,
        totalPages: 2,
      });
    });
  });

  describe('alert idempotency', () => {
    it('does not alert again for an absence already flagged', async () => {
      db.hostelAttendance.findMany.mockResolvedValue([]); // unaccounted_notified_at IS NULL filter returns nothing
      await expect(service.raiseUnaccountedAlerts({})).resolves.toBe(0);
      const where = db.hostelAttendance.findMany.mock.calls[0][0].where;
      expect(where.unaccounted_notified_at).toBeNull();
      expect(notifications.notifyStaff).not.toHaveBeenCalled();
    });

    it('claims the rows before notifying, so a concurrent caller alerts nothing', async () => {
      db.hostelAttendance.findMany.mockResolvedValue([
        {
          attendance_id: 1,
          institute_id: 'inst-1',
          resident_id: 1,
          attendance_date: localToday(),
          session: 'night',
          resident: { student_name: 'R1', allotments: [] },
        },
      ]);
      db.hostelAttendance.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.raiseUnaccountedAlerts({})).resolves.toBe(0);
      expect(notifications.notifyStaff).not.toHaveBeenCalled();
    });
  });
});
