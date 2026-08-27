import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * All metrics are computed via COUNT/GROUP BY/AVG aggregate queries — never
 * by loading full record sets into application memory (section 26).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(from?: string, to?: string) {
    const range: any = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return Object.keys(range).length > 0 ? range : undefined;
  }

  private async visitorMetrics(from?: string, to?: string) {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    const [todayVisitors, currentlyCheckedIn, checkedOutToday, byHostRaw] = await Promise.all([
      this.prisma.frontOfficeVisitorLog.count({ where: { check_in_time: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.frontOfficeVisitorLog.count({ where: { status: 'checked_in' } }),
      this.prisma.frontOfficeVisitorLog.count({ where: { status: 'checked_out', check_out_time: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.frontOfficeVisitorLog.groupBy({
        by: ['host_employee_id'],
        where: { check_in_time: this.dateRange(from, to) },
        _count: { _all: true },
      }),
    ]);

    const employees = await this.prisma.frontOfficeEmployee.findMany({
      where: { employee_id: { in: byHostRaw.map((r) => r.host_employee_id) } },
      include: { department: { select: { name: true } } },
    });
    const employeeMap = new Map(employees.map((e) => [e.employee_id, e]));

    const byHost = byHostRaw.map((r) => ({
      host_employee_id: r.host_employee_id,
      host_name: employeeMap.get(r.host_employee_id)?.name ?? 'Unknown',
      department: employeeMap.get(r.host_employee_id)?.department?.name ?? 'Unknown',
      count: r._count._all,
    }));

    const byDay = await this.prisma.$queryRawUnsafe<Array<{ day: Date; count: bigint }>>(
      `SELECT DATE_TRUNC('day', check_in_time) AS day, COUNT(*)::bigint AS count
       FROM front_office_visitor_logs
       WHERE ($1::timestamp IS NULL OR check_in_time >= $1) AND ($2::timestamp IS NULL OR check_in_time <= $2)
       GROUP BY 1 ORDER BY 1 ASC`,
      from ? new Date(from) : null,
      to ? new Date(to) : null,
    );

    return {
      today_visitors: todayVisitors,
      currently_checked_in: currentlyCheckedIn,
      checked_out_today: checkedOutToday,
      by_day: byDay.map((r) => ({ day: r.day, count: Number(r.count) })),
      by_host: byHost,
    };
  }

  private async enquiryMetrics(from?: string, to?: string) {
    const createdRange = this.dateRange(from, to);
    const [total, byStatus, bySource, byCategory, byAssignee, upcomingFollowups, overdueFollowups] = await Promise.all([
      this.prisma.frontOfficeEnquiry.count({ where: { created_at: createdRange } }),
      this.prisma.frontOfficeEnquiry.groupBy({ by: ['status'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeEnquiry.groupBy({ by: ['source'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeEnquiry.groupBy({ by: ['category'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeEnquiry.groupBy({ by: ['assigned_to'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeEnquiryFollowup.count({ where: { next_followup_date: { gte: new Date() } } }),
      this.prisma.frontOfficeEnquiryFollowup.count({ where: { next_followup_date: { lt: new Date() }, enquiry: { status: { not: 'closed' } } } }),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    return {
      total,
      open: statusMap.open ?? 0,
      in_progress: statusMap.in_progress ?? 0,
      closed: statusMap.closed ?? 0,
      by_source: bySource.map((r) => ({ source: r.source, count: r._count._all })),
      by_category: byCategory.map((r) => ({ category: r.category, count: r._count._all })),
      by_assignee: byAssignee.map((r) => ({ assigned_to: r.assigned_to, count: r._count._all })),
      pending_followups: upcomingFollowups,
      overdue_followups: overdueFollowups,
    };
  }

  private async appointmentMetrics(from?: string, to?: string) {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const dateRange = this.dateRange(from, to);

    const [todayCount, upcomingCount, byStatus, byDepartment, byEmployee] = await Promise.all([
      this.prisma.frontOfficeAppointment.count({ where: { appointment_date: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.frontOfficeAppointment.count({ where: { appointment_date: { gt: todayEnd }, status: { notIn: ['cancelled', 'no_show'] } } }),
      this.prisma.frontOfficeAppointment.groupBy({ by: ['status'], where: { appointment_date: dateRange }, _count: { _all: true } }),
      this.prisma.frontOfficeAppointment.groupBy({ by: ['department_id'], where: { appointment_date: dateRange }, _count: { _all: true } }),
      this.prisma.frontOfficeAppointment.groupBy({ by: ['host_employee_id'], where: { appointment_date: dateRange }, _count: { _all: true } }),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    const departments = await this.prisma.frontOfficeDepartment.findMany({ where: { department_id: { in: byDepartment.map((r) => r.department_id) } } });
    const deptMap = new Map(departments.map((d) => [d.department_id, d.name]));
    const employees = await this.prisma.frontOfficeEmployee.findMany({ where: { employee_id: { in: byEmployee.map((r) => r.host_employee_id) } } });
    const empMap = new Map(employees.map((e) => [e.employee_id, e.name]));

    return {
      today: todayCount,
      upcoming: upcomingCount,
      completed: statusMap.completed ?? 0,
      cancelled: statusMap.cancelled ?? 0,
      no_show: statusMap.no_show ?? 0,
      by_department: byDepartment.map((r) => ({ department_id: r.department_id, department: deptMap.get(r.department_id) ?? 'Unknown', count: r._count._all })),
      by_employee: byEmployee.map((r) => ({ host_employee_id: r.host_employee_id, employee: empMap.get(r.host_employee_id) ?? 'Unknown', count: r._count._all })),
    };
  }

  private async complaintMetrics(from?: string, to?: string) {
    const createdRange = this.dateRange(from, to);
    const [total, byStatus, byPriority, byCategory, byAssignee, avgResolutionRaw] = await Promise.all([
      this.prisma.frontOfficeComplaint.count({ where: { created_at: createdRange } }),
      this.prisma.frontOfficeComplaint.groupBy({ by: ['status'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeComplaint.groupBy({ by: ['priority'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeComplaint.groupBy({ by: ['category'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.frontOfficeComplaint.groupBy({ by: ['assigned_to'], where: { created_at: createdRange }, _count: { _all: true } }),
      this.prisma.$queryRawUnsafe<Array<{ avg_hours: number | null }>>(
        `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0) AS avg_hours
         FROM front_office_complaints
         WHERE resolved_at IS NOT NULL
           AND ($1::timestamp IS NULL OR created_at >= $1)
           AND ($2::timestamp IS NULL OR created_at <= $2)`,
        from ? new Date(from) : null,
        to ? new Date(to) : null,
      ),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    const priorityMap = Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all]));

    return {
      total,
      open: statusMap.open ?? 0,
      in_progress: statusMap.in_progress ?? 0,
      resolved: statusMap.resolved ?? 0,
      closed: statusMap.closed ?? 0,
      critical_or_high: (priorityMap.critical ?? 0) + (priorityMap.high ?? 0),
      by_priority: byPriority.map((r) => ({ priority: r.priority, count: r._count._all })),
      by_category: byCategory.map((r) => ({ category: r.category, count: r._count._all })),
      by_assignee: byAssignee.map((r) => ({ assigned_to: r.assigned_to, count: r._count._all })),
      average_resolution_hours: avgResolutionRaw[0]?.avg_hours != null ? Number(avgResolutionRaw[0].avg_hours.toFixed(1)) : null,
    };
  }

  async getSummary(from?: string, to?: string) {
    const [visitors, enquiries, appointments, complaints] = await Promise.all([
      this.visitorMetrics(from, to),
      this.enquiryMetrics(from, to),
      this.appointmentMetrics(from, to),
      this.complaintMetrics(from, to),
    ]);
    return { range: { from: from ?? null, to: to ?? null }, visitors, enquiries, appointments, complaints };
  }
}
