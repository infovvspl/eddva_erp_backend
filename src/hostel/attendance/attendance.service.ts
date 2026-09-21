import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HostelAttendanceSession,
  HostelAttendanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HostelLookupService } from '../common/hostel-lookup.service';
import { HostelNotificationService } from '../notifications/hostel-notification.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { BusinessException } from '../common/business-exception';
import { isUniqueViolation, orConflict } from '../common/unique-violation.util';
import {
  addDays,
  dateOnlyString,
  localToday,
  parseDateOnly,
  sessionWindow,
} from '../common/time.util';
import { buildMeta, parsePagination } from '../common/pagination.util';
import {
  BulkAttendanceDto,
  MarkAttendanceDto,
  QueryAttendanceDto,
  UnaccountedAbsenceQueryDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';

const SESSIONS: HostelAttendanceSession[] = ['morning', 'night'];

const ATTENDANCE_INCLUDE = {
  resident: {
    select: {
      resident_id: true,
      student_name: true,
      admission_no: true,
      status: true,
    },
  },
} satisfies Prisma.HostelAttendanceInclude;

interface AbsenceRow {
  attendance_id: number;
  institute_id: string;
  resident_id: number;
  attendance_date: Date;
  session: HostelAttendanceSession;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: HostelLookupService,
    private readonly audit: HostelAuditService,
    private readonly notifications: HostelNotificationService,
  ) {}

  private resolveDate(value?: string): Date {
    const date = value ? parseDateOnly(value, 'attendance_date') : localToday();
    if (date.getTime() > localToday().getTime()) {
      throw new BusinessException(
        'ATTENDANCE_DATE_IN_FUTURE',
        'Attendance cannot be marked for a future date',
      );
    }
    return date;
  }

  private range(query: { date?: string; from?: string; to?: string }) {
    if (query.date) {
      const day = parseDateOnly(query.date, 'date');
      return { gte: day, lte: day };
    }
    const gte = query.from ? parseDateOnly(query.from, 'from') : undefined;
    const lte = query.to ? parseDateOnly(query.to, 'to') : undefined;
    if (gte && lte && gte > lte) {
      throw new BusinessException(
        'INVALID_DATE_RANGE',
        'from must not be after to',
      );
    }
    return gte || lte ? { gte, lte } : undefined;
  }

  // ─── Marking ──────────────────────────────────────────────────────────────

  async mark(actor: HostelPlatformUser, dto: MarkAttendanceDto) {
    const date = this.resolveDate(dto.attendance_date);
    const resident = await this.lookup.resident(
      actor.institute_id,
      dto.resident_id,
    );
    if (resident.status !== 'active') {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        `Resident is ${resident.status}; roll call covers active residents only`,
        { status: resident.status },
      );
    }
    const record = await orConflict(
      `Attendance for this resident on ${dateOnlyString(date)} (${dto.session}) is already marked. Use PATCH to correct it.`,
      () =>
        this.prisma.hostelAttendance.create({
          data: {
            institute_id: actor.institute_id,
            resident_id: dto.resident_id,
            attendance_date: date,
            session: dto.session,
            status: dto.status,
            remarks: dto.remarks,
            marked_by: actor.eddva_user_id,
          },
          include: ATTENDANCE_INCLUDE,
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ATTENDANCE,
      entityId: String(record.attendance_id),
      action: 'mark',
      newStatus: record.status,
      metadata: {
        resident_id: record.resident_id,
        date: dateOnlyString(date),
        session: record.session,
      },
    });
    if (record.status === 'absent') {
      await this.raiseUnaccountedAlerts({
        attendance_id: record.attendance_id,
      });
    }
    return record;
  }

  /**
   * Roll call for a whole session in one call. All-or-nothing: unknown/inactive
   * residents or already-marked residents fail the request with the offending
   * ids listed, so a warden never ends up with a half-saved register.
   */
  async bulk(actor: HostelPlatformUser, dto: BulkAttendanceDto) {
    const date = this.resolveDate(dto.attendance_date);
    const ids = dto.entries.map((e) => e.resident_id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      throw new BusinessException(
        'DUPLICATE_ENTRIES',
        'A resident appears more than once in the request',
        { resident_ids: [...new Set(duplicates)] },
        400,
      );
    }

    const [residents, existing] = await Promise.all([
      this.prisma.hostelResident.findMany({
        where: { institute_id: actor.institute_id, resident_id: { in: ids } },
        select: { resident_id: true, status: true },
      }),
      this.prisma.hostelAttendance.findMany({
        where: {
          institute_id: actor.institute_id,
          attendance_date: date,
          session: dto.session,
          resident_id: { in: ids },
        },
        select: { resident_id: true },
      }),
    ]);
    const found = new Map(residents.map((r) => [r.resident_id, r.status]));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BusinessException(
        'RESIDENTS_NOT_FOUND',
        `${missing.length} resident(s) not found`,
        { resident_ids: missing },
        404,
      );
    }
    const inactive = ids.filter((id) => found.get(id) !== 'active');
    if (inactive.length > 0) {
      throw new BusinessException(
        'RESIDENT_NOT_ACTIVE',
        `${inactive.length} resident(s) are not active`,
        { resident_ids: inactive },
      );
    }
    if (existing.length > 0) {
      throw new BusinessException(
        'ATTENDANCE_ALREADY_MARKED',
        `Attendance is already marked for ${existing.length} resident(s) on ${dateOnlyString(date)} (${dto.session})`,
        { resident_ids: existing.map((e) => e.resident_id) },
        409,
      );
    }

    let created: number;
    try {
      ({ count: created } = await this.prisma.hostelAttendance.createMany({
        data: dto.entries.map((e) => ({
          institute_id: actor.institute_id,
          resident_id: e.resident_id,
          attendance_date: date,
          session: dto.session,
          status: e.status,
          remarks: e.remarks,
          marked_by: actor.eddva_user_id,
        })),
      }));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Some residents were marked by someone else while you were submitting. Reload and retry.',
        );
      }
      throw err;
    }

    const tally = (s: HostelAttendanceStatus) =>
      dto.entries.filter((e) => e.status === s).length;
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ATTENDANCE,
      entityId: `${dateOnlyString(date)}:${dto.session}`,
      action: 'bulk_mark',
      metadata: {
        date: dateOnlyString(date),
        session: dto.session,
        present: tally('present'),
        absent: tally('absent'),
        on_leave: tally('on_leave'),
      },
    });
    const absentIds = dto.entries
      .filter((e) => e.status === 'absent')
      .map((e) => e.resident_id);
    const unaccounted =
      absentIds.length > 0
        ? await this.raiseUnaccountedAlerts({
            institute_id: actor.institute_id,
            attendance_date: date,
            session: dto.session,
            resident_id: { in: absentIds },
          })
        : 0;
    return {
      attendance_date: dateOnlyString(date),
      session: dto.session,
      created,
      present: tally('present'),
      absent: tally('absent'),
      on_leave: tally('on_leave'),
      unaccounted_absences: unaccounted,
    };
  }

  async update(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateAttendanceDto,
  ) {
    const before = await this.prisma.hostelAttendance.findFirst({
      where: { attendance_id: id, institute_id: actor.institute_id },
    });
    if (!before) {
      throw new NotFoundException(`Attendance record #${id} not found`);
    }
    const updated = await this.prisma.hostelAttendance.update({
      where: { attendance_id: id },
      data: {
        status: dto.status,
        remarks: dto.remarks,
        updated_by: actor.eddva_user_id,
        // a changed status must be re-evaluated for alerts
        ...(dto.status !== before.status
          ? { unaccounted_notified_at: null }
          : {}),
      },
      include: ATTENDANCE_INCLUDE,
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.ATTENDANCE,
      entityId: String(id),
      action: 'update',
      oldStatus: before.status,
      newStatus: updated.status,
      reason: dto.remarks,
      metadata: {
        resident_id: before.resident_id,
        date: dateOnlyString(before.attendance_date),
        session: before.session,
      },
    });
    if (updated.status === 'absent' && before.status !== 'absent') {
      await this.raiseUnaccountedAlerts({ attendance_id: id });
    }
    return updated;
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  private where(
    instituteId: string,
    query: QueryAttendanceDto,
  ): Prisma.HostelAttendanceWhereInput {
    const range = this.range(query);
    const placement: Prisma.HostelRoomAllotmentWhereInput | undefined =
      query.block_id || query.room_id
        ? {
            status: 'active',
            ...(query.room_id ? { room_id: query.room_id } : {}),
            ...(query.block_id ? { room: { block_id: query.block_id } } : {}),
          }
        : undefined;
    return {
      institute_id: instituteId,
      session: query.session,
      status: query.status,
      resident_id: query.resident_id,
      ...(range ? { attendance_date: range } : {}),
      ...(placement || query.search
        ? {
            resident: {
              ...(placement ? { allotments: { some: placement } } : {}),
              ...(query.search
                ? {
                    OR: [
                      {
                        student_name: {
                          contains: query.search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        admission_no: {
                          contains: query.search,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };
  }

  async findAll(instituteId: string, query: QueryAttendanceDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where = this.where(instituteId, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelAttendance.findMany({
        where,
        include: ATTENDANCE_INCLUDE,
        orderBy: [
          { attendance_date: 'desc' },
          { session: 'asc' },
          { resident_id: 'asc' },
        ],
        skip,
        take,
      }),
      this.prisma.hostelAttendance.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const row = await this.prisma.hostelAttendance.findFirst({
      where: { attendance_id: id, institute_id: instituteId },
      include: ATTENDANCE_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Attendance record #${id} not found`);
    }
    return row;
  }

  async residentHistory(
    instituteId: string,
    residentId: number,
    query: QueryAttendanceDto,
  ) {
    await this.lookup.resident(instituteId, residentId);
    return this.findAll(instituteId, { ...query, resident_id: residentId });
  }

  /** Per-session tallies for a day or range, plus who is still unmarked when a single day is asked for. */
  async summary(instituteId: string, query: QueryAttendanceDto) {
    const where = this.where(instituteId, { ...query, status: undefined });
    const groups = await this.prisma.hostelAttendance.groupBy({
      by: ['session', 'status'],
      where,
      _count: { _all: true },
    });
    const count = (
      session: HostelAttendanceSession,
      status: HostelAttendanceStatus,
    ) =>
      groups.find((g) => g.session === session && g.status === status)?._count
        ._all ?? 0;

    const by_session = Object.fromEntries(
      SESSIONS.filter((s) => !query.session || query.session === s).map((s) => [
        s,
        {
          present: count(s, 'present'),
          absent: count(s, 'absent'),
          on_leave: count(s, 'on_leave'),
        },
      ]),
    );
    const totals = { present: 0, absent: 0, on_leave: 0 };
    for (const s of Object.values(by_session)) {
      totals.present += s.present;
      totals.absent += s.absent;
      totals.on_leave += s.on_leave;
    }

    const singleDay = !!query.date || (!!query.from && query.from === query.to);
    let unmarked: Record<string, number> | undefined;
    if (singleDay) {
      const active = await this.prisma.hostelResident.count({
        where: { institute_id: instituteId, status: 'active' },
      });
      unmarked = Object.fromEntries(
        Object.entries(by_session).map(([s, v]) => [
          s,
          Math.max(0, active - v.present - v.absent - v.on_leave),
        ]),
      );
    }
    return {
      ...totals,
      total_marked: totals.present + totals.absent + totals.on_leave,
      by_session,
      unmarked,
    };
  }

  // ─── Absences & unaccounted absences ─────────────────────────────────────

  /**
   * For each absence, the gate-verified pass (if any) that explains it: the
   * resident was actually outside the gate at some point during that roll-call
   * session. An approved pass that was never scanned out does NOT explain an
   * absence — gate scanning is the source of truth for real movement. One query.
   */
  private async explainingPasses(rows: AbsenceRow[]) {
    const explained = new Map<
      number,
      { gate_pass_id: number; pass_no: string; status: string }
    >();
    if (rows.length === 0) return explained;

    const windows = rows.map((r) =>
      sessionWindow(r.attendance_date, r.session),
    );
    const minStart = new Date(
      Math.min(...windows.map((w) => w.start.getTime())),
    );
    const maxEnd = new Date(Math.max(...windows.map((w) => w.end.getTime())));
    const passes = await this.prisma.hostelGatePass.findMany({
      where: {
        resident_id: { in: [...new Set(rows.map((r) => r.resident_id))] },
        actual_out_at: { not: null, lt: maxEnd },
        OR: [
          { actual_return_at: null },
          { actual_return_at: { gt: minStart } },
        ],
      },
      select: {
        gate_pass_id: true,
        pass_no: true,
        status: true,
        resident_id: true,
        actual_out_at: true,
        actual_return_at: true,
      },
    });

    rows.forEach((row, i) => {
      const { start, end } = windows[i];
      const hit = passes.find(
        (p) =>
          p.resident_id === row.resident_id &&
          p.actual_out_at! < end &&
          (!p.actual_return_at || p.actual_return_at > start),
      );
      if (hit) explained.set(row.attendance_id, hit);
    });
    return explained;
  }

  /** Absence report: absent rows in a range, each flagged with the pass that explains it (if any). */
  async absences(instituteId: string, query: QueryAttendanceDto) {
    const { skip, take, page, limit } = parsePagination(query);
    if (query.unaccounted_only) {
      const all = await this.unaccountedAll(instituteId, query);
      return {
        data: all.slice(skip, skip + take),
        pagination: buildMeta(all.length, page, limit),
      };
    }
    const where = {
      ...this.where(instituteId, query),
      status: 'absent' as const,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hostelAttendance.findMany({
        where,
        include: ATTENDANCE_INCLUDE,
        orderBy: [{ attendance_date: 'desc' }, { session: 'asc' }],
        skip,
        take,
      }),
      this.prisma.hostelAttendance.count({ where }),
    ]);
    const explained = await this.explainingPasses(rows);
    return {
      data: rows.map((r) => ({
        ...r,
        accounted_for: explained.has(r.attendance_id),
        gate_pass: explained.get(r.attendance_id) ?? null,
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  /**
   * Residents marked ABSENT at roll call with no gate-verified pass explaining
   * it — the unaccounted-for case that needs a warden's attention now.
   * Defaults to today; covers both sessions unless one is given.
   * Returns every match (capped at 5000) — used by the dashboard, reports and alert API.
   */
  async unaccountedAll(instituteId: string, query: UnaccountedAbsenceQueryDto) {
    const range = this.range(query) ?? { gte: localToday(), lte: localToday() };
    const rows = await this.prisma.hostelAttendance.findMany({
      where: {
        institute_id: instituteId,
        status: 'absent',
        session: query.session,
        attendance_date: range,
        ...(query.block_id
          ? {
              resident: {
                allotments: {
                  some: {
                    status: 'active',
                    room: { block_id: query.block_id },
                  },
                },
              },
            }
          : {}),
      },
      include: {
        resident: {
          select: {
            resident_id: true,
            student_name: true,
            admission_no: true,
            guardian_name: true,
            guardian_phone: true,
            allotments: {
              where: { status: 'active' },
              take: 1,
              select: {
                room: {
                  select: {
                    room_id: true,
                    room_number: true,
                    block: {
                      select: { block_id: true, name: true, warden_name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { attendance_date: 'desc' },
        { session: 'asc' },
        { resident_id: 'asc' },
      ],
      take: 5000,
    });
    const explained = await this.explainingPasses(rows);
    return rows
      .filter((r) => !explained.has(r.attendance_id))
      .map(({ resident, ...row }) => {
        const { allotments, ...person } = resident;
        return {
          ...row,
          resident: person,
          room: allotments[0]?.room ?? null,
          accounted_for: false as const,
        };
      });
  }

  /** The alert API: the same rows, in the standard paginated list shape. */
  async unaccountedAbsences(
    instituteId: string,
    query: UnaccountedAbsenceQueryDto,
  ) {
    const all = await this.unaccountedAll(instituteId, query);
    const { skip, take, page, limit } = parsePagination(query);
    return {
      data: all.slice(skip, skip + take),
      pagination: buildMeta(all.length, page, limit),
    };
  }

  /**
   * Queues a warden/admin alert for every absence in `where` that no gate pass
   * explains and that has not already been alerted. `unaccounted_notified_at`
   * makes this idempotent, so it is safe to call from both the marking paths
   * and the periodic sweep.
   */
  async raiseUnaccountedAlerts(
    where: Prisma.HostelAttendanceWhereInput,
  ): Promise<number> {
    const rows = await this.prisma.hostelAttendance.findMany({
      where: { ...where, status: 'absent', unaccounted_notified_at: null },
      include: {
        resident: {
          select: {
            student_name: true,
            allotments: {
              where: { status: 'active' },
              take: 1,
              select: {
                room: {
                  select: { block: { select: { warden_user_id: true } } },
                },
              },
            },
          },
        },
      },
      take: 2000,
    });
    if (rows.length === 0) return 0;
    const explained = await this.explainingPasses(rows);
    const unaccounted = rows.filter((r) => !explained.has(r.attendance_id));
    if (unaccounted.length === 0) return 0;

    // Claim first (conditional on still-unnotified) so concurrent callers alert once.
    const claimed = await this.prisma.hostelAttendance.updateMany({
      where: {
        attendance_id: { in: unaccounted.map((r) => r.attendance_id) },
        unaccounted_notified_at: null,
      },
      data: { unaccounted_notified_at: new Date() },
    });
    if (claimed.count === 0) return 0;

    for (const row of unaccounted) {
      await this.notifications.notifyStaff(
        {
          instituteId: row.institute_id,
          entityType: HOSTEL_ENTITY.ATTENDANCE,
          entityId: row.attendance_id,
          eventType: 'unaccounted_absence',
          message: `${row.resident.student_name} was absent at ${dateOnlyString(row.attendance_date)} ${row.session} roll call with no gate pass on record.`,
        },
        [row.resident.allotments[0]?.room.block.warden_user_id ?? null, null],
      );
    }
    this.logger.warn(`Raised ${claimed.count} unaccounted-absence alert(s)`);
    return claimed.count;
  }

  /** Scheduler entry point: yesterday + today are re-checked so a late roll call is not missed. */
  sweepUnaccountedAbsences(): Promise<number> {
    const today = localToday();
    return this.raiseUnaccountedAlerts({
      attendance_date: { gte: addDays(today, -1), lte: today },
    });
  }
}
