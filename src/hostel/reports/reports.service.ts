import { Injectable } from '@nestjs/common';
import {
  HostelAllotmentStatus,
  HostelAttendanceSession,
  HostelAttendanceStatus,
  HostelComplaintCategory,
  HostelComplaintStatus,
  HostelDisciplineCategory,
  HostelGatePassStatus,
  HostelInvoicePaymentStatus,
  HostelMealAttendanceStatus,
  HostelMealType,
  HostelPaymentMode,
  HostelResidentGender,
  HostelResidentStatus,
  HostelRoomStatus,
  HostelRoomType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelOccupancyStatsService } from '../common/hostel-occupancy-stats.service';
import { AttendanceService } from '../attendance/attendance.service';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { OUTSTANDING } from '../fees/invoices.service';
import { CsvRow, toCsv } from '../common/csv.util';
import { enumParam } from '../common/enum-param';
import { dateOnlyString, localToday, parseDateOnly } from '../common/time.util';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { HostelReportQueryDto, ReportName } from './dto/report-query.dto';

/** Reports read at most this many rows; the JSON response says when it was cut short. */
export const REPORT_ROW_CAP = 5000;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const day = (d: Date | null | undefined) => (d ? dateOnlyString(d) : null);
const minutesBetween = (later: Date, earlier: Date) =>
  Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 60000));

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: HostelOccupancyStatsService,
    private readonly attendance: AttendanceService,
  ) {}

  /** Placement filter shared by reports about people: "currently in this block/room". */
  private placement(q: HostelReportQueryDto): Prisma.HostelResidentWhereInput {
    return q.block_id || q.room_id
      ? {
          allotments: {
            some: {
              status: 'active',
              ...(q.room_id ? { room_id: q.room_id } : {}),
              ...(q.block_id ? { room: { block_id: q.block_id } } : {}),
            },
          },
        }
      : {};
  }

  private async rows(
    instituteId: string,
    report: ReportName,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    switch (report) {
      case 'occupancy':
        return this.occupancy(instituteId, q);
      case 'room-occupancy':
        return this.roomOccupancy(instituteId, q);
      case 'residents':
        return this.residents(instituteId, q);
      case 'allotment-history':
        return this.allotmentHistory(instituteId, q);
      case 'gate-movement':
        return this.gateMovement(instituteId, q);
      case 'overdue-residents':
        return this.overdueResidents(instituteId, q);
      case 'attendance':
        return this.attendanceReport(instituteId, q);
      case 'unaccounted-absences':
        return this.unaccounted(instituteId, q);
      case 'visitors':
        return this.visitors(instituteId, q);
      case 'mess-consumption':
        return this.messConsumption(instituteId, q);
      case 'complaints':
        return this.complaints(instituteId, q);
      case 'fee-outstanding':
        return this.feeOutstanding(instituteId, q);
      case 'fee-payments':
        return this.feePayments(instituteId, q);
      case 'discipline':
        return this.discipline(instituteId, q);
    }
  }

  async run(instituteId: string, report: ReportName, q: HostelReportQueryDto) {
    const all = await this.rows(instituteId, report, q);
    const { skip, take, page, limit } = parsePagination(q);
    return {
      report,
      data: all.slice(skip, skip + take),
      pagination: buildMeta(all.length, page, limit),
      summary: {
        total_rows: all.length,
        truncated: all.length >= REPORT_ROW_CAP,
      },
    };
  }

  async exportCsv(
    instituteId: string,
    report: ReportName,
    q: HostelReportQueryDto,
  ) {
    return toCsv(await this.rows(instituteId, report, q));
  }

  // ─── Occupancy ────────────────────────────────────────────────────────────

  private async occupancy(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const rooms = await this.stats.rooms(instituteId, {
      ...(q.block_id ? { block_id: q.block_id } : {}),
      ...(enumParam(q.room_type, Object.values(HostelRoomType), 'room_type')
        ? { room_type: q.room_type as HostelRoomType }
        : {}),
    });
    const blocks = await this.prisma.hostelBlock.findMany({
      where: {
        institute_id: instituteId,
        deleted_at: null,
        ...(q.block_id ? { block_id: q.block_id } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return blocks.map((b) => {
      const t = this.stats.totals(
        rooms.filter((r) => r.block_id === b.block_id),
      );
      return {
        block: b.name,
        gender_type: b.gender_type,
        warden: b.warden_name,
        active: b.is_active,
        rooms: t.total_rooms,
        rooms_available: t.rooms_available,
        rooms_full: t.rooms_full,
        rooms_under_maintenance: t.rooms_under_maintenance,
        capacity: t.total_capacity,
        occupied: t.occupied,
        vacant: t.vacant,
        occupancy_percentage: t.occupancy_percentage,
      };
    });
  }

  private async roomOccupancy(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const roomType = enumParam(
      q.room_type,
      Object.values(HostelRoomType),
      'room_type',
    );
    const status = enumParam(
      q.status,
      Object.values(HostelRoomStatus),
      'status',
    );
    const rooms = await this.stats.rooms(instituteId, {
      ...(q.block_id ? { block_id: q.block_id } : {}),
      ...(roomType ? { room_type: roomType } : {}),
      ...(status ? { status } : {}),
    });
    const blocks = await this.prisma.hostelBlock.findMany({
      where: { institute_id: instituteId },
      select: { block_id: true, name: true },
    });
    const names = new Map(blocks.map((b) => [b.block_id, b.name]));
    return rooms.slice(0, REPORT_ROW_CAP).map((r) => ({
      block: names.get(r.block_id) ?? '',
      floor: r.floor,
      room_number: r.room_number,
      room_type: r.room_type,
      status: r.status,
      capacity: r.capacity,
      occupied: r.occupied,
      vacant: r.vacant,
    }));
  }

  // ─── People & placement ───────────────────────────────────────────────────

  private async residents(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const status = enumParam(
      q.status,
      Object.values(HostelResidentStatus),
      'status',
    );
    const gender = enumParam(
      q.gender,
      Object.values(HostelResidentGender),
      'gender',
    );
    const list = await this.prisma.hostelResident.findMany({
      where: {
        institute_id: instituteId,
        status,
        gender,
        ...this.placement(q),
      },
      include: {
        allotments: {
          where: { status: 'active' },
          take: 1,
          select: {
            academic_year: true,
            allotment_date: true,
            room: {
              select: {
                room_number: true,
                floor: true,
                block: { select: { name: true } },
              },
            },
            bed: { select: { bed_number: true } },
          },
        },
      },
      orderBy: { student_name: 'asc' },
      take: REPORT_ROW_CAP,
    });
    return list.map((r) => {
      const a = r.allotments[0];
      return {
        student_name: r.student_name,
        admission_no: r.admission_no,
        gender: r.gender,
        grade: r.grade,
        status: r.status,
        block: a?.room.block.name,
        floor: a?.room.floor,
        room: a?.room.room_number,
        bed: a?.bed?.bed_number,
        academic_year: a?.academic_year,
        allotted_on: day(a?.allotment_date),
        guardian_name: r.guardian_name,
        guardian_phone: r.guardian_phone,
        admitted_on: day(r.admitted_on),
        vacated_on: day(r.vacated_on),
      };
    });
  }

  private async allotmentHistory(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const status = enumParam(
      q.status,
      Object.values(HostelAllotmentStatus),
      'status',
    );
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelRoomAllotment.findMany({
      where: {
        institute_id: instituteId,
        status,
        resident_id: q.resident_id,
        room_id: q.room_id,
        academic_year: q.academic_year,
        ...(q.block_id ? { room: { block_id: q.block_id } } : {}),
        ...(range ? { allotment_date: range } : {}),
      },
      include: {
        resident: { select: { student_name: true, admission_no: true } },
        room: {
          select: { room_number: true, block: { select: { name: true } } },
        },
        bed: { select: { bed_number: true } },
      },
      orderBy: [{ allotment_date: 'desc' }, { allotment_id: 'desc' }],
      take: REPORT_ROW_CAP,
    });
    return list.map((a) => ({
      student_name: a.resident.student_name,
      admission_no: a.resident.admission_no,
      block: a.room.block.name,
      room: a.room.room_number,
      bed: a.bed?.bed_number,
      academic_year: a.academic_year,
      allotment_date: day(a.allotment_date),
      vacate_date: day(a.vacate_date),
      status: a.status,
      allotted_by: a.allotted_by,
      closed_by: a.closed_by,
      close_reason: a.close_reason,
    }));
  }

  // ─── Gate ─────────────────────────────────────────────────────────────────

  private gateRow(
    p: {
      pass_no: string;
      pass_type: string;
      destination: string;
      status: string;
      requested_out_at: Date;
      expected_return_at: Date;
      actual_out_at: Date | null;
      actual_return_at: Date | null;
      approved_by: string | null;
      scanned_out_by: string | null;
      scanned_in_by: string | null;
      resident: { student_name: string; admission_no: string | null };
    },
    now = new Date(),
  ): CsvRow {
    const returnedOrNow = p.actual_return_at ?? now;
    const late =
      p.actual_out_at && returnedOrNow > p.expected_return_at
        ? minutesBetween(returnedOrNow, p.expected_return_at)
        : 0;
    return {
      pass_no: p.pass_no,
      student_name: p.resident.student_name,
      admission_no: p.resident.admission_no,
      pass_type: p.pass_type,
      destination: p.destination,
      requested_out_at: iso(p.requested_out_at),
      expected_return_at: iso(p.expected_return_at),
      actual_out_at: iso(p.actual_out_at),
      actual_return_at: iso(p.actual_return_at),
      status: p.status,
      late_minutes: late,
      approved_by: p.approved_by,
      scanned_out_by: p.scanned_out_by,
      scanned_in_by: p.scanned_in_by,
    };
  }

  private async gateMovement(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const status = enumParam(
      q.status,
      Object.values(HostelGatePassStatus),
      'status',
    );
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelGatePass.findMany({
      where: {
        institute_id: instituteId,
        status,
        resident_id: q.resident_id,
        ...(range ? { requested_out_at: range } : {}),
        ...(q.block_id || q.room_id ? { resident: this.placement(q) } : {}),
      },
      include: {
        resident: { select: { student_name: true, admission_no: true } },
      },
      orderBy: { requested_out_at: 'desc' },
      take: REPORT_ROW_CAP,
    });
    return list.map((p) => this.gateRow(p));
  }

  private async overdueResidents(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const now = new Date();
    const list = await this.prisma.hostelGatePass.findMany({
      where: {
        AND: [
          GatePassesService.overdueWhere(instituteId, now),
          q.block_id || q.room_id ? { resident: this.placement(q) } : {},
        ],
      },
      include: {
        resident: {
          select: {
            student_name: true,
            admission_no: true,
            guardian_name: true,
            guardian_phone: true,
          },
        },
      },
      orderBy: { expected_return_at: 'asc' },
      take: REPORT_ROW_CAP,
    });
    return list.map((p) => ({
      ...this.gateRow(p, now),
      guardian_name: p.resident.guardian_name,
      guardian_phone: p.resident.guardian_phone,
    }));
  }

  // ─── Attendance ───────────────────────────────────────────────────────────

  private async attendanceReport(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const status = enumParam(
      q.status,
      Object.values(HostelAttendanceStatus),
      'status',
    );
    const session = enumParam(
      q.session,
      Object.values(HostelAttendanceSession),
      'session',
    );
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelAttendance.findMany({
      where: {
        institute_id: instituteId,
        status,
        session,
        resident_id: q.resident_id,
        ...(range ? { attendance_date: range } : {}),
        ...(q.block_id || q.room_id ? { resident: this.placement(q) } : {}),
      },
      include: {
        resident: { select: { student_name: true, admission_no: true } },
      },
      orderBy: [{ attendance_date: 'desc' }, { session: 'asc' }],
      take: REPORT_ROW_CAP,
    });
    return list.map((a) => ({
      date: day(a.attendance_date),
      session: a.session,
      student_name: a.resident.student_name,
      admission_no: a.resident.admission_no,
      status: a.status,
      remarks: a.remarks,
      marked_by: a.marked_by,
      marked_at: iso(a.marked_at),
    }));
  }

  private async unaccounted(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const session = enumParam(
      q.session,
      Object.values(HostelAttendanceSession),
      'session',
    );
    const from = q.from ?? dateOnlyString(localToday());
    const to = q.to ?? from;
    parseDateOnly(from, 'from');
    parseDateOnly(to, 'to');
    const result = await this.attendance.unaccountedAll(instituteId, {
      from,
      to,
      session,
      block_id: q.block_id,
    });
    return result.slice(0, REPORT_ROW_CAP).map((r) => ({
      date: day(r.attendance_date),
      session: r.session,
      student_name: r.resident.student_name,
      admission_no: r.resident.admission_no,
      guardian_name: r.resident.guardian_name,
      guardian_phone: r.resident.guardian_phone,
      block: r.room?.block.name,
      room: r.room?.room_number,
      marked_by: r.marked_by,
    }));
  }

  // ─── Visitors (no ID proof data — masked or otherwise — in reports) ──────

  private async visitors(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelVisitorLog.findMany({
      where: {
        institute_id: instituteId,
        resident_id: q.resident_id,
        ...(range ? { in_time: range } : {}),
        ...(q.block_id || q.room_id ? { resident: this.placement(q) } : {}),
      },
      include: {
        resident: { select: { student_name: true, admission_no: true } },
      },
      orderBy: { in_time: 'desc' },
      take: REPORT_ROW_CAP,
    });
    return list.map((v) => ({
      student_name: v.resident.student_name,
      admission_no: v.resident.admission_no,
      visitor_name: v.visitor_name,
      relation: v.relation,
      purpose: v.purpose,
      in_time: iso(v.in_time),
      out_time: iso(v.out_time),
      duration_minutes: v.out_time
        ? minutesBetween(v.out_time, v.in_time)
        : null,
      recorded_by: v.recorded_by,
    }));
  }

  // ─── Mess ─────────────────────────────────────────────────────────────────

  private async messConsumption(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const meal = enumParam(
      q.meal_type,
      Object.values(HostelMealType),
      'meal_type',
    );
    const range = buildDateRange(q.from, q.to);
    const groups = await this.prisma.hostelMessAttendance.groupBy({
      by: ['meal_date', 'meal_type', 'status'],
      where: {
        institute_id: instituteId,
        meal_type: meal,
        ...(range ? { meal_date: range } : {}),
        ...(q.block_id ? { resident: this.placement(q) } : {}),
      },
      _count: { _all: true },
    });
    const byKey = new Map<string, Record<string, unknown>>();
    for (const g of groups) {
      const key = `${dateOnlyString(g.meal_date)}|${g.meal_type}`;
      const row = byKey.get(key) ?? {
        date: dateOnlyString(g.meal_date),
        meal_type: g.meal_type,
        ...Object.fromEntries(
          Object.values(HostelMealAttendanceStatus).map((s) => [s, 0]),
        ),
      };
      row[g.status] = g._count._all;
      byKey.set(key, row);
    }
    return [...byKey.values()]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, REPORT_ROW_CAP)
      .map((r) => {
        const consumed = Number(r.consumed);
        const served = consumed + Number(r.missed);
        return {
          ...r,
          consumption_rate:
            served === 0 ? null : Math.round((consumed / served) * 10000) / 100,
        };
      });
  }

  // ─── Complaints ───────────────────────────────────────────────────────────

  private async complaints(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const status = enumParam(
      q.status,
      Object.values(HostelComplaintStatus),
      'status',
    );
    const category = enumParam(
      q.category,
      Object.values(HostelComplaintCategory),
      'category',
    );
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelComplaint.findMany({
      where: {
        institute_id: instituteId,
        status,
        category,
        resident_id: q.resident_id,
        room_id: q.room_id,
        ...(q.block_id ? { room: { block_id: q.block_id } } : {}),
        ...(range ? { created_at: range } : {}),
      },
      include: {
        resident: { select: { student_name: true } },
        room: {
          select: { room_number: true, block: { select: { name: true } } },
        },
      },
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
      take: REPORT_ROW_CAP,
    });
    return list.map((c) => ({
      complaint_id: c.complaint_id,
      created_at: iso(c.created_at),
      block: c.room?.block.name,
      room: c.room?.room_number,
      resident: c.resident?.student_name,
      category: c.category,
      priority: c.priority,
      status: c.status,
      assigned_to: c.assigned_to_name,
      resolved_at: iso(c.resolved_at),
      hours_to_resolve: c.resolved_at
        ? Math.round(
            ((c.resolved_at.getTime() - c.created_at.getTime()) / 3600000) * 10,
          ) / 10
        : null,
      description: c.description,
    }));
  }

  // ─── Fees ─────────────────────────────────────────────────────────────────

  private async feeOutstanding(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const status = enumParam(
      q.status,
      Object.values(HostelInvoicePaymentStatus),
      'status',
    );
    const today = localToday();
    const list = await this.prisma.hostelFeeInvoice.findMany({
      where: {
        institute_id: instituteId,
        ...OUTSTANDING,
        ...(status ? { payment_status: status } : {}),
        resident_id: q.resident_id,
        ...(q.block_id || q.room_id ? { resident: this.placement(q) } : {}),
      },
      include: {
        resident: {
          select: {
            student_name: true,
            admission_no: true,
            guardian_phone: true,
          },
        },
      },
      orderBy: { due_date: 'asc' },
      take: REPORT_ROW_CAP,
    });
    return list.map((i) => ({
      invoice_no: i.invoice_no,
      student_name: i.resident.student_name,
      admission_no: i.resident.admission_no,
      guardian_phone: i.resident.guardian_phone,
      billing_period: i.billing_period,
      amount_due: i.amount_due.toFixed(2),
      amount_paid: i.amount_paid.toFixed(2),
      balance: i.amount_due.minus(i.amount_paid).toFixed(2),
      due_date: day(i.due_date),
      days_overdue:
        i.due_date < today
          ? Math.floor((today.getTime() - i.due_date.getTime()) / 86400000)
          : 0,
      payment_status: i.payment_status,
    }));
  }

  private async feePayments(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const mode = enumParam(
      q.payment_mode,
      Object.values(HostelPaymentMode),
      'payment_mode',
    );
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelFeePayment.findMany({
      where: {
        institute_id: instituteId,
        payment_mode: mode,
        resident_id: q.resident_id,
        ...(range ? { payment_date: range } : {}),
      },
      include: {
        resident: { select: { student_name: true, admission_no: true } },
        invoice: { select: { invoice_no: true, billing_period: true } },
      },
      orderBy: [{ payment_date: 'desc' }, { payment_id: 'desc' }],
      take: REPORT_ROW_CAP,
    });
    return list.map((p) => ({
      receipt_no: p.receipt_no,
      payment_date: day(p.payment_date),
      student_name: p.resident.student_name,
      admission_no: p.resident.admission_no,
      invoice_no: p.invoice.invoice_no,
      billing_period: p.invoice.billing_period,
      amount_paid: p.amount_paid.toFixed(2),
      payment_mode: p.payment_mode,
      transaction_ref: p.transaction_ref,
      received_by: p.received_by,
    }));
  }

  // ─── Discipline ───────────────────────────────────────────────────────────

  private async discipline(
    instituteId: string,
    q: HostelReportQueryDto,
  ): Promise<CsvRow[]> {
    const category = enumParam(
      q.category,
      Object.values(HostelDisciplineCategory),
      'category',
    );
    const range = buildDateRange(q.from, q.to);
    const list = await this.prisma.hostelDisciplineRecord.findMany({
      where: {
        institute_id: instituteId,
        category,
        resident_id: q.resident_id,
        ...(range ? { incident_date: range } : {}),
        ...(q.block_id || q.room_id ? { resident: this.placement(q) } : {}),
      },
      include: {
        resident: { select: { student_name: true, admission_no: true } },
        gate_pass: { select: { pass_no: true } },
      },
      orderBy: [{ incident_date: 'desc' }, { record_id: 'desc' }],
      take: REPORT_ROW_CAP,
    });
    return list.map((d) => ({
      incident_date: day(d.incident_date),
      student_name: d.resident.student_name,
      admission_no: d.resident.admission_no,
      category: d.category,
      action_taken: d.action_taken,
      fine_amount: d.fine_amount?.toFixed(2),
      gate_pass: d.gate_pass?.pass_no,
      description: d.description,
      recorded_by: d.recorded_by,
    }));
  }
}
