import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelOccupancyStatsService } from '../common/hostel-occupancy-stats.service';
import { AttendanceService } from '../attendance/attendance.service';
import { MessAttendanceService } from '../mess/mess-attendance.service';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { OUTSTANDING } from '../fees/invoices.service';
import {
  dateOnlyString,
  dayRange,
  localToday,
  parseDateOnly,
} from '../common/time.util';

const money = (value: Prisma.Decimal | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

/**
 * Aggregate numbers for the hostel dashboard. Each section is its own method
 * (and endpoint) so a screen can load just what it shows; `summary` runs them
 * concurrently. Everything is a COUNT/SUM/GROUP BY — no rows are loaded to be
 * counted in memory (the room list in `occupancy` is one row per room).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: HostelOccupancyStatsService,
    private readonly attendance: AttendanceService,
    private readonly mess: MessAttendanceService,
  ) {}

  async occupancy(instituteId: string) {
    const [blocks, rooms, beds, residents] = await Promise.all([
      this.prisma.hostelBlock.groupBy({
        by: ['is_active'],
        where: { institute_id: instituteId, deleted_at: null },
        _count: { _all: true },
      }),
      this.stats.rooms(instituteId),
      this.prisma.hostelBed.groupBy({
        by: ['status'],
        where: {
          institute_id: instituteId,
          deleted_at: null,
          room: { deleted_at: null },
        },
        _count: { _all: true },
      }),
      this.prisma.hostelResident.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
    ]);
    const bed = (s: 'vacant' | 'occupied') =>
      beds.find((b) => b.status === s)?._count._all ?? 0;
    const resident = (s: 'active' | 'vacated' | 'suspended') =>
      residents.find((r) => r.status === s)?._count._all ?? 0;
    const totals = this.stats.totals(rooms);
    return {
      total_blocks: blocks.reduce((sum, b) => sum + b._count._all, 0),
      active_blocks: blocks.find((b) => b.is_active)?._count._all ?? 0,
      total_rooms: totals.total_rooms,
      rooms_available: totals.rooms_available,
      rooms_full: totals.rooms_full,
      rooms_under_maintenance: totals.rooms_under_maintenance,
      total_capacity: totals.total_capacity,
      occupied_places: totals.occupied,
      vacant_places: totals.vacant,
      occupancy_percentage: totals.occupancy_percentage,
      beds: {
        total_beds: bed('vacant') + bed('occupied'),
        occupied_beds: bed('occupied'),
        vacant_beds: bed('vacant'),
      },
      residents: {
        total_residents:
          resident('active') + resident('vacated') + resident('suspended'),
        active: resident('active'),
        vacated: resident('vacated'),
        suspended: resident('suspended'),
      },
    };
  }

  async gateStatus(instituteId: string) {
    const now = new Date();
    const { start, end } = dayRange(localToday());
    const today = { gte: start, lt: end };
    const [out, expectedToday, overdue, outings, returns, pending] =
      await Promise.all([
        this.prisma.hostelGatePass.count({
          where: {
            institute_id: instituteId,
            status: { in: ['out', 'overdue'] },
          },
        }),
        // still outside (or yet to leave on an approved pass) and due back today
        this.prisma.hostelGatePass.count({
          where: {
            institute_id: instituteId,
            status: { in: ['approved', 'out', 'overdue'] },
            actual_return_at: null,
            expected_return_at: today,
          },
        }),
        this.prisma.hostelGatePass.count({
          where: GatePassesService.overdueWhere(instituteId, now),
        }),
        this.prisma.hostelGatePass.count({
          where: { institute_id: instituteId, actual_out_at: today },
        }),
        this.prisma.hostelGatePass.count({
          where: { institute_id: instituteId, actual_return_at: today },
        }),
        this.prisma.hostelGatePass.count({
          where: { institute_id: instituteId, status: 'pending' },
        }),
      ]);
    return {
      currently_out: out,
      expected_returns_today: expectedToday,
      overdue_passes: overdue,
      todays_outings: outings,
      todays_returns: returns,
      pending_approvals: pending,
    };
  }

  async attendanceStats(instituteId: string, dateStr?: string) {
    const date = dateStr ? parseDateOnly(dateStr, 'date') : localToday();
    const day = dateOnlyString(date);
    const [summary, unaccounted] = await Promise.all([
      this.attendance.summary(instituteId, { date: day }),
      this.attendance.unaccountedAll(instituteId, { date: day }),
    ]);
    return {
      date: day,
      present: summary.present,
      absent: summary.absent,
      on_leave: summary.on_leave,
      unaccounted_absences: unaccounted.length,
      by_session: summary.by_session,
      unmarked: summary.unmarked,
    };
  }

  async complaints(instituteId: string) {
    const [byStatus, urgent, unassigned] = await Promise.all([
      this.prisma.hostelComplaint.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.hostelComplaint.count({
        where: {
          institute_id: instituteId,
          priority: 'urgent',
          status: { in: ['open', 'in_progress'] },
        },
      }),
      this.prisma.hostelComplaint.count({
        where: {
          institute_id: instituteId,
          assigned_to: null,
          status: { in: ['open', 'in_progress'] },
        },
      }),
    ]);
    const n = (s: 'open' | 'in_progress' | 'resolved' | 'closed') =>
      byStatus.find((g) => g.status === s)?._count._all ?? 0;
    return {
      open: n('open'),
      in_progress: n('in_progress'),
      urgent,
      unassigned,
      resolved: n('resolved'),
      closed: n('closed'),
    };
  }

  async fees(instituteId: string) {
    const today = localToday();
    const live = { institute_id: instituteId, cancelled_at: null };
    const [all, overdueAgg, overdueCount, outstandingCount] = await Promise.all(
      [
        this.prisma.hostelFeeInvoice.aggregate({
          where: live,
          _sum: { amount_due: true, amount_paid: true },
          _count: { _all: true },
        }),
        this.prisma.hostelFeeInvoice.aggregate({
          where: {
            institute_id: instituteId,
            ...OUTSTANDING,
            due_date: { lt: today },
          },
          _sum: { amount_due: true, amount_paid: true },
        }),
        this.prisma.hostelFeeInvoice.count({
          where: {
            institute_id: instituteId,
            ...OUTSTANDING,
            due_date: { lt: today },
          },
        }),
        this.prisma.hostelFeeInvoice.count({
          where: { institute_id: instituteId, ...OUTSTANDING },
        }),
      ],
    );
    const due = money(all._sum.amount_due);
    const paid = money(all._sum.amount_paid);
    return {
      total_invoices: all._count._all,
      total_due: due.toFixed(2),
      total_paid: paid.toFixed(2),
      outstanding: due.minus(paid).toFixed(2),
      outstanding_invoices: outstandingCount,
      overdue_invoices: overdueCount,
      overdue_amount: money(overdueAgg._sum.amount_due)
        .minus(money(overdueAgg._sum.amount_paid))
        .toFixed(2),
    };
  }

  async messStats(instituteId: string, dateStr?: string) {
    const day = dateOnlyString(
      dateStr ? parseDateOnly(dateStr, 'date') : localToday(),
    );
    const summary = await this.mess.summary(instituteId, { date: day });
    return {
      date: day,
      expected_meals: summary.by_meal.reduce(
        (sum, m) =>
          sum + (('expected_meals' in m ? m.expected_meals : 0) as number),
        0,
      ),
      opted_in: summary.opted_in,
      opted_out: summary.opted_out,
      consumed: summary.consumed,
      missed: summary.missed,
      by_meal: summary.by_meal,
    };
  }

  async summary(instituteId: string, date?: string, includeFees = true) {
    const [occupancy, gate, attendance, complaints, fees, mess] =
      await Promise.all([
        this.occupancy(instituteId),
        this.gateStatus(instituteId),
        this.attendanceStats(instituteId, date),
        this.complaints(instituteId),
        includeFees ? this.fees(instituteId) : Promise.resolve(null),
        this.messStats(instituteId, date),
      ]);
    return { occupancy, gate, attendance, complaints, fees, mess };
  }
}
