import { Injectable } from '@nestjs/common';
import {
  AlumniApplicationStatus,
  AlumniCampaignStatus,
  AlumniDonationPaymentMode,
  AlumniDonationStatus,
  AlumniEventStatus,
  AlumniJobStatus,
  AlumniMatchStatus,
  AlumniVerificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CsvRow } from '../common/csv.util';
import { enumParam } from '../common/enum-param';
import { sqlUtc } from '../common/sql-time';
import {
  buildDateRange,
  buildMeta,
  parsePagination,
} from '../common/pagination.util';
import { AlumniReportQueryDto, ReportName } from './dto/report-query.dto';

export interface ReportResult {
  report: ReportName;
  columns: string[];
  rows: CsvRow[];
  total: number;
  pagination?: ReturnType<typeof buildMeta>;
}

export const EXPORT_ROW_LIMIT = 10_000;

const ENUMS = {
  verification: Object.values(AlumniVerificationStatus),
  event: Object.values(AlumniEventStatus),
  job: Object.values(AlumniJobStatus),
  application: Object.values(AlumniApplicationStatus),
  match: Object.values(AlumniMatchStatus),
  campaign: Object.values(AlumniCampaignStatus),
  donation: Object.values(AlumniDonationStatus),
  mode: Object.values(AlumniDonationPaymentMode),
};

const num = (v: unknown) => (v == null ? 0 : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dateOnly = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;
const rate = (n: number, d: number) =>
  d === 0 ? null : Number((n / d).toFixed(4));

/** `AND col >= from AND col <= to` for raw queries (or nothing). `column` is a trusted, already-quoted SQL identifier. */
function sqlRange(column: string, range?: { gte?: Date; lte?: Date }) {
  const col = Prisma.raw(column);
  return Prisma.sql`${range?.gte ? Prisma.sql`AND ${col} >= ${sqlUtc(range.gte)}` : Prisma.empty} ${
    range?.lte ? Prisma.sql`AND ${col} <= ${sqlUtc(range.lte)}` : Prisma.empty
  }`;
}

/**
 * Backend query/report APIs. Every report is a database-level query scoped to
 * one institute; row reports are paginated (CSV export raises the page size
 * to EXPORT_ROW_LIMIT), aggregate reports return one row per group. CSV
 * rendering reuses the module's small serializer — there is no Excel/PDF export
 * library anywhere in this codebase to integrate with.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    instituteId: string,
    report: ReportName,
    query: AlumniReportQueryDto,
    exporting = false,
  ): Promise<ReportResult> {
    const q = exporting
      ? { ...query, page: 1, limit: EXPORT_ROW_LIMIT }
      : query;
    switch (report) {
      case 'alumni-directory':
        return this.alumniDirectory(instituteId, q);
      case 'alumni-by-batch':
        return this.alumniGroupBy(report, instituteId, 'batch_year');
      case 'alumni-by-program':
        return this.alumniGroupBy(report, instituteId, 'program');
      case 'alumni-employment':
        return this.alumniEmployment(instituteId, q);
      case 'alumni-location':
        return this.alumniLocation(instituteId);
      case 'event-registrations':
        return this.eventRegistrations(instituteId, q);
      case 'event-attendance':
        return this.eventAttendance(instituteId, q);
      case 'event-revenue':
        return this.eventRevenue(instituteId, q);
      case 'job-postings':
        return this.jobPostings(instituteId, q);
      case 'job-applications':
        return this.jobApplications(instituteId, q);
      case 'hiring':
        return this.hiring(instituteId, q);
      case 'mentors':
        return this.mentors(instituteId, q);
      case 'mentees':
        return this.matches(report, instituteId, q, 'active');
      case 'mentorship-matches':
        return this.matches(report, instituteId, q);
      case 'campaigns':
        return this.campaigns(instituteId, q);
      case 'donations':
        return this.donations(instituteId, q);
      case 'donor-history':
        return this.donorHistory(instituteId, q);
      case 'donation-totals':
        return this.donationTotals(instituteId, q);
      case 'payment-modes':
        return this.paymentModes(instituteId, q);
      case 'newsletters':
      case 'engagement':
        return this.newsletters(report, instituteId, q);
      case 'delivery-statistics':
        return this.deliveryStatistics(instituteId, q);
    }
  }

  private result(
    report: ReportName,
    columns: string[],
    rows: CsvRow[],
    total = rows.length,
    pagination?: ReturnType<typeof buildMeta>,
  ): ReportResult {
    return { report, columns, rows, total, pagination };
  }

  // ─── Alumni ──────────────────────────────────────────────────────────────

  private async alumniDirectory(instituteId: string, q: AlumniReportQueryDto) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const where: Prisma.AlumniProfileWhereInput = {
      institute_id: instituteId,
      batch_year: q.batch_year,
      verification_status: enumParam(q.status, ENUMS.verification, 'status'),
      ...(q.program
        ? { program: { equals: q.program, mode: 'insensitive' } }
        : {}),
      ...(range ? { registered_at: range } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniProfile.findMany({
        where,
        orderBy: [{ batch_year: 'desc' }, { full_name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.alumniProfile.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((a) => ({
      alumni_id: a.alumni_id,
      name: a.full_name,
      batch_year: a.batch_year,
      graduation_year: a.graduation_year,
      program: a.program,
      email: a.email,
      phone: a.phone,
      company: a.current_company,
      designation: a.current_designation,
      industry: a.industry,
      city: a.city,
      country: a.country,
      verification_status: a.verification_status,
      visibility: a.visibility,
      source: a.source,
      active: a.is_active,
      registered_at: iso(a.registered_at),
    }));
    return this.result(
      'alumni-directory',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async alumniGroupBy(
    report: 'alumni-by-batch' | 'alumni-by-program',
    instituteId: string,
    column: 'batch_year' | 'program',
  ) {
    const col = Prisma.raw(`"${column}"`);
    const data = await this.prisma.$queryRaw<
      Array<{
        key: string | number | null;
        total: number;
        verified: number;
        pending: number;
      }>
    >`
      SELECT ${col} AS key, COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE "verification_status" = 'verified')::int AS verified,
             COUNT(*) FILTER (WHERE "verification_status" = 'pending')::int AS pending
      FROM "alumni_profiles"
      WHERE "institute_id" = ${instituteId} AND "is_active"
      GROUP BY 1 ORDER BY 1 DESC NULLS LAST`;
    const rows: CsvRow[] = data.map((r) => ({
      [column]: r.key ?? '(none)',
      total: r.total,
      verified: r.verified,
      pending: r.pending,
    }));
    return this.result(report, [column, 'total', 'verified', 'pending'], rows);
  }

  private async alumniEmployment(instituteId: string, q: AlumniReportQueryDto) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const where: Prisma.AlumniEmploymentWhereInput = {
      institute_id: instituteId,
      is_active: true,
      ...(range ? { start_date: range } : {}),
      alumni: q.batch_year ? { batch_year: q.batch_year } : undefined,
      ...(q.search
        ? { company: { contains: q.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniEmployment.findMany({
        where,
        orderBy: [{ alumni_id: 'asc' }, { start_date: 'desc' }],
        skip,
        take,
        include: { alumni: { select: { full_name: true, batch_year: true } } },
      }),
      this.prisma.alumniEmployment.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((e) => ({
      alumni_id: e.alumni_id,
      name: e.alumni.full_name,
      batch_year: e.alumni.batch_year,
      company: e.company,
      designation: e.designation,
      industry: e.industry,
      location: e.location,
      start_date: dateOnly(e.start_date),
      end_date: dateOnly(e.end_date),
      is_current: e.is_current,
    }));
    return this.result(
      'alumni-employment',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async alumniLocation(instituteId: string) {
    const data = await this.prisma.$queryRaw<
      Array<{ country: string | null; city: string | null; total: number }>
    >`
      SELECT "country", "city", COUNT(*)::int AS total
      FROM "alumni_profiles"
      WHERE "institute_id" = ${instituteId} AND "is_active"
      GROUP BY 1, 2 ORDER BY total DESC, 1, 2`;
    const rows: CsvRow[] = data.map((r) => ({
      country: r.country ?? '(unknown)',
      city: r.city ?? '(unknown)',
      alumni: r.total,
    }));
    return this.result('alumni-location', ['country', 'city', 'alumni'], rows);
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  private async eventRegistrations(
    instituteId: string,
    q: AlumniReportQueryDto,
  ) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const where: Prisma.AlumniEventRegistrationWhereInput = {
      institute_id: instituteId,
      event_id: q.event_id,
      ...(range ? { registered_at: range } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniEventRegistration.findMany({
        where,
        orderBy: [{ event_id: 'asc' }, { registered_at: 'asc' }],
        skip,
        take,
        include: {
          event: { select: { title: true, event_date: true } },
          alumni: { select: { full_name: true, email: true } },
        },
      }),
      this.prisma.alumniEventRegistration.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((r) => ({
      registration_id: r.registration_id,
      event: r.event.title,
      event_date: iso(r.event.event_date),
      alumni: r.alumni.full_name,
      email: r.alumni.email,
      registered_at: iso(r.registered_at),
      attendance_status: r.attendance_status,
      payment_status: r.payment_status,
      amount_due: r.amount_due ? Number(r.amount_due) : null,
    }));
    return this.result(
      'event-registrations',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async eventAttendance(instituteId: string, q: AlumniReportQueryDto) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{
        event_id: number;
        title: string;
        event_date: Date;
        status: string;
        registered: number;
        attended: number;
        no_show: number;
        cancelled: number;
        pending: number;
      }>
    >`
      SELECT e."event_id", e."title", e."event_date", e."status"::text AS status,
        COUNT(r.*) FILTER (WHERE r."attendance_status" <> 'cancelled')::int AS registered,
        COUNT(r.*) FILTER (WHERE r."attendance_status" = 'attended')::int AS attended,
        COUNT(r.*) FILTER (WHERE r."attendance_status" = 'no_show')::int AS no_show,
        COUNT(r.*) FILTER (WHERE r."attendance_status" = 'cancelled')::int AS cancelled,
        COUNT(r.*) FILTER (WHERE r."attendance_status" = 'registered')::int AS pending
      FROM "alumni_events" e
      LEFT JOIN "alumni_event_registrations" r ON r."event_id" = e."event_id"
      WHERE e."institute_id" = ${instituteId}
        ${q.event_id ? Prisma.sql`AND e."event_id" = ${q.event_id}` : Prisma.empty}
        ${sqlRange('e."event_date"', range)}
      GROUP BY e."event_id" ORDER BY e."event_date" DESC
      LIMIT ${EXPORT_ROW_LIMIT}`;
    const rows: CsvRow[] = data.map((r) => ({
      event_id: r.event_id,
      event: r.title,
      event_date: iso(r.event_date),
      status: r.status,
      registered: r.registered,
      attended: r.attended,
      no_show: r.no_show,
      cancelled: r.cancelled,
      not_yet_marked: r.pending,
      attendance_rate: rate(r.attended, r.registered),
    }));
    return this.result('event-attendance', Object.keys(rows[0] ?? {}), rows);
  }

  private async eventRevenue(instituteId: string, q: AlumniReportQueryDto) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{
        event_id: number;
        title: string;
        ticket_price: Prisma.Decimal;
        paid_count: number;
        pending_count: number;
        revenue: Prisma.Decimal;
        pending_amount: Prisma.Decimal;
      }>
    >`
      SELECT e."event_id", e."title", e."ticket_price",
        COUNT(r.*) FILTER (WHERE r."payment_status" = 'paid')::int AS paid_count,
        COUNT(r.*) FILTER (WHERE r."payment_status" = 'pending' AND r."attendance_status" <> 'cancelled')::int AS pending_count,
        COALESCE(SUM(p."amount"), 0) AS revenue,
        COALESCE(SUM(r."amount_due") FILTER (WHERE r."payment_status" = 'pending' AND r."attendance_status" <> 'cancelled'), 0) AS pending_amount
      FROM "alumni_events" e
      LEFT JOIN "alumni_event_registrations" r ON r."event_id" = e."event_id"
      LEFT JOIN "alumni_event_payments" p ON p."registration_id" = r."registration_id"
      WHERE e."institute_id" = ${instituteId} AND e."is_paid"
        ${q.event_id ? Prisma.sql`AND e."event_id" = ${q.event_id}` : Prisma.empty}
        ${sqlRange('e."event_date"', range)}
      GROUP BY e."event_id" ORDER BY e."event_date" DESC
      LIMIT ${EXPORT_ROW_LIMIT}`;
    const rows: CsvRow[] = data.map((r) => ({
      event_id: r.event_id,
      event: r.title,
      ticket_price: num(r.ticket_price),
      paid_registrations: r.paid_count,
      pending_registrations: r.pending_count,
      revenue: num(r.revenue),
      pending_amount: num(r.pending_amount),
    }));
    return this.result('event-revenue', Object.keys(rows[0] ?? {}), rows);
  }

  // ─── Jobs ────────────────────────────────────────────────────────────────

  private async jobPostings(instituteId: string, q: AlumniReportQueryDto) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const status = enumParam(q.status, ENUMS.job, 'status');
    const now = new Date();
    const where: Prisma.AlumniJobWhereInput = {
      institute_id: instituteId,
      ...(range ? { posted_date: range } : {}),
      ...(status === 'open'
        ? {
            status: 'open',
            OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
          }
        : status === 'expired'
          ? {
              OR: [
                { status: 'expired' },
                { status: 'open', expiry_date: { lte: now } },
              ],
            }
          : status
            ? { status }
            : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniJob.findMany({
        where,
        orderBy: { posted_date: 'desc' },
        skip,
        take,
        include: {
          posted_by: { select: { full_name: true } },
          _count: { select: { applications: true } },
        },
      }),
      this.prisma.alumniJob.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((j) => ({
      job_id: j.job_id,
      title: j.title,
      company: j.company,
      location: j.location,
      job_type: j.job_type,
      industry: j.industry,
      posted_by: j.posted_by?.full_name ?? '(staff / partner company)',
      posted_date: iso(j.posted_date),
      expiry_date: iso(j.expiry_date),
      status:
        j.status === 'open' && j.expiry_date && j.expiry_date <= now
          ? 'expired'
          : j.status,
      applications: j._count.applications,
    }));
    return this.result(
      'job-postings',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async jobApplications(instituteId: string, q: AlumniReportQueryDto) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const where: Prisma.AlumniJobApplicationWhereInput = {
      institute_id: instituteId,
      job_id: q.job_id,
      status: enumParam(q.status, ENUMS.application, 'status'),
      ...(range ? { applied_at: range } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniJobApplication.findMany({
        where,
        orderBy: { applied_at: 'desc' },
        skip,
        take,
        include: {
          job: { select: { title: true, company: true } },
          applicant: {
            select: { full_name: true, email: true, batch_year: true },
          },
        },
      }),
      this.prisma.alumniJobApplication.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((a) => ({
      application_id: a.application_id,
      job: a.job.title,
      company: a.job.company,
      applicant: a.applicant.full_name,
      email: a.applicant.email,
      batch_year: a.applicant.batch_year,
      applied_at: iso(a.applied_at),
      status: a.status,
      status_updated_at: iso(a.status_updated_at),
    }));
    return this.result(
      'job-applications',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async hiring(instituteId: string, q: AlumniReportQueryDto) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{
        job_id: number;
        title: string;
        company: string;
        status: string;
        applications: number;
        shortlisted: number;
        rejected: number;
        hired: number;
      }>
    >`
      SELECT j."job_id", j."title", j."company", j."status"::text AS status,
        COUNT(a.*)::int AS applications,
        COUNT(a.*) FILTER (WHERE a."status" = 'shortlisted')::int AS shortlisted,
        COUNT(a.*) FILTER (WHERE a."status" = 'rejected')::int AS rejected,
        COUNT(a.*) FILTER (WHERE a."status" = 'hired')::int AS hired
      FROM "alumni_jobs" j
      LEFT JOIN "alumni_job_applications" a ON a."job_id" = j."job_id"
      WHERE j."institute_id" = ${instituteId}
        ${q.job_id ? Prisma.sql`AND j."job_id" = ${q.job_id}` : Prisma.empty}
        ${sqlRange('j."posted_date"', range)}
      GROUP BY j."job_id" ORDER BY hired DESC, applications DESC
      LIMIT ${EXPORT_ROW_LIMIT}`;
    const rows: CsvRow[] = data.map((r) => ({
      job_id: r.job_id,
      title: r.title,
      company: r.company,
      status: r.status,
      applications: r.applications,
      shortlisted: r.shortlisted,
      rejected: r.rejected,
      hired: r.hired,
      hire_rate: rate(r.hired, r.applications),
    }));
    return this.result('hiring', Object.keys(rows[0] ?? {}), rows);
  }

  // ─── Mentorship ──────────────────────────────────────────────────────────

  private async mentors(instituteId: string, q: AlumniReportQueryDto) {
    const { skip, take, page, limit } = parsePagination(q);
    const where: Prisma.AlumniMentorProfileWhereInput = {
      institute_id: instituteId,
      ...(q.search
        ? {
            alumni: {
              full_name: { contains: q.search.trim(), mode: 'insensitive' },
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniMentorProfile.findMany({
        where,
        orderBy: { mentor_id: 'asc' },
        skip,
        take,
        include: {
          alumni: {
            select: {
              full_name: true,
              current_company: true,
              industry: true,
              city: true,
            },
          },
          _count: { select: { matches: { where: { status: 'active' } } } },
        },
      }),
      this.prisma.alumniMentorProfile.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((m) => ({
      mentor_id: m.mentor_id,
      mentor: m.alumni.full_name,
      company: m.alumni.current_company,
      industry: m.alumni.industry,
      city: m.alumni.city,
      expertise: m.expertise_areas.join('; '),
      status: m.status,
      max_mentees: m.max_mentees,
      active_mentees: m._count.matches,
    }));
    return this.result(
      'mentors',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async matches(
    report: 'mentees' | 'mentorship-matches',
    instituteId: string,
    q: AlumniReportQueryDto,
    forceStatus?: AlumniMatchStatus,
  ) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const where: Prisma.AlumniMentorshipMatchWhereInput = {
      institute_id: instituteId,
      status: forceStatus ?? enumParam(q.status, ENUMS.match, 'status'),
      ...(range ? { matched_date: range } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniMentorshipMatch.findMany({
        where,
        orderBy: [{ matched_date: 'desc' }, { match_id: 'desc' }],
        skip,
        take,
        include: {
          program: { select: { name: true } },
          mentor: { select: { alumni: { select: { full_name: true } } } },
          mentee_alumni: { select: { full_name: true } },
        },
      }),
      this.prisma.alumniMentorshipMatch.count({ where }),
    ]);
    const rows: CsvRow[] = data.map((m) => ({
      match_id: m.match_id,
      program: m.program.name,
      mentor: m.mentor.alumni.full_name,
      mentee: m.mentee_alumni?.full_name ?? m.mentee_name,
      mentee_type: m.mentee_alumni_id ? 'alumnus' : 'current_student',
      mentee_student_ref: m.mentee_student_ref,
      status: m.status,
      matched_date: dateOnly(m.matched_date),
      ended_at: iso(m.ended_at),
      end_reason: m.end_reason,
    }));
    return this.result(
      report,
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  // ─── Fundraising ─────────────────────────────────────────────────────────

  private async campaigns(instituteId: string, q: AlumniReportQueryDto) {
    const status = enumParam(q.status, ENUMS.campaign, 'status');
    const data = await this.prisma.$queryRaw<
      Array<{
        campaign_id: number;
        title: string;
        status: string;
        goal_amount: Prisma.Decimal;
        cached: Prisma.Decimal;
        ledger: Prisma.Decimal;
        donations: number;
        donors: number;
        pending: number;
      }>
    >`
      SELECT c."campaign_id", c."title", c."status"::text AS status, c."goal_amount",
        c."raised_amount" AS cached,
        COALESCE(SUM(d."amount") FILTER (WHERE d."status" = 'received'), 0) AS ledger,
        COUNT(d.*) FILTER (WHERE d."status" = 'received')::int AS donations,
        COUNT(DISTINCT d."alumni_id") FILTER (WHERE d."status" = 'received')::int AS donors,
        COUNT(d.*) FILTER (WHERE d."status" = 'pending')::int AS pending
      FROM "alumni_campaigns" c
      LEFT JOIN "alumni_donations" d ON d."campaign_id" = c."campaign_id"
      WHERE c."institute_id" = ${instituteId}
        ${status ? Prisma.sql`AND c."status" = ${status}::"AlumniCampaignStatus"` : Prisma.empty}
        ${q.campaign_id ? Prisma.sql`AND c."campaign_id" = ${q.campaign_id}` : Prisma.empty}
      GROUP BY c."campaign_id" ORDER BY c."start_date" DESC
      LIMIT ${EXPORT_ROW_LIMIT}`;
    const rows: CsvRow[] = data.map((r) => ({
      campaign_id: r.campaign_id,
      title: r.title,
      status: r.status,
      goal_amount: num(r.goal_amount),
      raised_amount: num(r.ledger),
      progress_pct:
        num(r.goal_amount) > 0
          ? Number(((num(r.ledger) / num(r.goal_amount)) * 100).toFixed(2))
          : null,
      donations: r.donations,
      donors: r.donors,
      pending_pledges: r.pending,
      cache_matches_ledger: num(r.cached) === num(r.ledger),
    }));
    return this.result('campaigns', Object.keys(rows[0] ?? {}), rows);
  }

  private async donations(instituteId: string, q: AlumniReportQueryDto) {
    const { skip, take, page, limit } = parsePagination(q);
    const range = buildDateRange(q.from, q.to);
    const where: Prisma.AlumniDonationWhereInput = {
      institute_id: instituteId,
      campaign_id: q.campaign_id,
      status: enumParam(q.status, ENUMS.donation, 'status'),
      payment_mode: enumParam(q.payment_mode, ENUMS.mode, 'payment_mode'),
      ...(range ? { donation_date: range } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alumniDonation.findMany({
        where,
        orderBy: [{ donation_date: 'desc' }, { donation_id: 'desc' }],
        skip,
        take,
        include: {
          alumni: { select: { full_name: true, batch_year: true } },
          campaign: { select: { title: true } },
        },
      }),
      this.prisma.alumniDonation.count({ where }),
    ]);
    // A staff finance report: the donor is shown even for anonymous gifts (flagged), for audit.
    const rows: CsvRow[] = data.map((d) => ({
      donation_id: d.donation_id,
      receipt_number: d.receipt_number,
      donor: d.alumni.full_name,
      batch_year: d.alumni.batch_year,
      anonymous: d.is_anonymous,
      campaign: d.campaign?.title ?? 'General fund',
      amount: num(d.amount),
      payment_mode: d.payment_mode,
      transaction_ref: d.transaction_ref,
      status: d.status,
      donation_date: iso(d.donation_date),
    }));
    return this.result(
      'donations',
      Object.keys(rows[0] ?? {}),
      rows,
      total,
      buildMeta(total, page, limit),
    );
  }

  private async donorHistory(instituteId: string, q: AlumniReportQueryDto) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{
        alumni_id: number;
        full_name: string;
        batch_year: number;
        donations: number;
        total: Prisma.Decimal;
        first_at: Date;
        last_at: Date;
      }>
    >`
      SELECT a."alumni_id", a."full_name", a."batch_year",
        COUNT(d.*)::int AS donations, SUM(d."amount") AS total,
        MIN(d."received_at") AS first_at, MAX(d."received_at") AS last_at
      FROM "alumni_donations" d
      JOIN "alumni_profiles" a ON a."alumni_id" = d."alumni_id"
      WHERE d."institute_id" = ${instituteId} AND d."status" = 'received'
        ${q.campaign_id ? Prisma.sql`AND d."campaign_id" = ${q.campaign_id}` : Prisma.empty}
        ${sqlRange('d."received_at"', range)}
      GROUP BY a."alumni_id" ORDER BY total DESC
      LIMIT ${EXPORT_ROW_LIMIT}`;
    const rows: CsvRow[] = data.map((r) => ({
      alumni_id: r.alumni_id,
      donor: r.full_name,
      batch_year: r.batch_year,
      donations: r.donations,
      total_given: num(r.total),
      first_donation: iso(r.first_at),
      last_donation: iso(r.last_at),
    }));
    return this.result('donor-history', Object.keys(rows[0] ?? {}), rows);
  }

  private async donationTotals(instituteId: string, q: AlumniReportQueryDto) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{
        month: Date;
        donations: number;
        donors: number;
        total: Prisma.Decimal;
      }>
    >`
      SELECT date_trunc('month', "received_at") AS month, COUNT(*)::int AS donations,
             COUNT(DISTINCT "alumni_id")::int AS donors, SUM("amount") AS total
      FROM "alumni_donations"
      WHERE "institute_id" = ${instituteId} AND "status" = 'received'
        ${q.campaign_id ? Prisma.sql`AND "campaign_id" = ${q.campaign_id}` : Prisma.empty}
        ${sqlRange('"received_at"', range)}
      GROUP BY 1 ORDER BY 1`;
    const rows: CsvRow[] = data.map((r) => ({
      month: dateOnly(r.month),
      donations: r.donations,
      donors: r.donors,
      total: num(r.total),
    }));
    return this.result(
      'donation-totals',
      ['month', 'donations', 'donors', 'total'],
      rows,
    );
  }

  private async paymentModes(instituteId: string, q: AlumniReportQueryDto) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{ payment_mode: string; donations: number; total: Prisma.Decimal }>
    >`
      SELECT "payment_mode"::text AS payment_mode, COUNT(*)::int AS donations, SUM("amount") AS total
      FROM "alumni_donations"
      WHERE "institute_id" = ${instituteId} AND "status" = 'received'
        ${q.campaign_id ? Prisma.sql`AND "campaign_id" = ${q.campaign_id}` : Prisma.empty}
        ${sqlRange('"received_at"', range)}
      GROUP BY 1 ORDER BY total DESC`;
    const grand = data.reduce((s, r) => s + num(r.total), 0);
    const rows: CsvRow[] = data.map((r) => ({
      payment_mode: r.payment_mode,
      donations: r.donations,
      total: num(r.total),
      share: rate(num(r.total), grand),
    }));
    return this.result(
      'payment-modes',
      ['payment_mode', 'donations', 'total', 'share'],
      rows,
    );
  }

  // ─── Communication ───────────────────────────────────────────────────────

  private async newsletters(
    report: 'newsletters' | 'engagement',
    instituteId: string,
    q: AlumniReportQueryDto,
  ) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{
        newsletter_id: number;
        title: string;
        sent_at: Date | null;
        messages: number;
        delivered: number;
        opened: number;
        clicked: number;
        failed: number;
        queued: number;
      }>
    >`
      SELECT n."newsletter_id", n."title", n."sent_at",
        COUNT(l.*)::int AS messages,
        COUNT(l.*) FILTER (WHERE l."status" IN ('sent','opened','clicked'))::int AS delivered,
        COUNT(l.*) FILTER (WHERE l."status" IN ('opened','clicked'))::int AS opened,
        COUNT(l.*) FILTER (WHERE l."status" = 'clicked')::int AS clicked,
        COUNT(l.*) FILTER (WHERE l."status" = 'failed')::int AS failed,
        COUNT(l.*) FILTER (WHERE l."status" = 'queued')::int AS queued
      FROM "alumni_newsletters" n
      LEFT JOIN "alumni_communication_logs" l ON l."newsletter_id" = n."newsletter_id"
      WHERE n."institute_id" = ${instituteId} AND n."status" = 'sent'
        ${q.newsletter_id ? Prisma.sql`AND n."newsletter_id" = ${q.newsletter_id}` : Prisma.empty}
        ${sqlRange('n."sent_at"', range)}
      GROUP BY n."newsletter_id" ORDER BY n."sent_at" DESC
      LIMIT ${EXPORT_ROW_LIMIT}`;
    const rows: CsvRow[] =
      report === 'newsletters'
        ? data.map((r) => ({
            newsletter_id: r.newsletter_id,
            title: r.title,
            sent_at: iso(r.sent_at),
            messages: r.messages,
            queued: r.queued,
            delivered: r.delivered,
            failed: r.failed,
          }))
        : data.map((r) => ({
            newsletter_id: r.newsletter_id,
            title: r.title,
            delivered: r.delivered,
            opened: r.opened,
            clicked: r.clicked,
            open_rate: rate(r.opened, r.delivered),
            click_rate: rate(r.clicked, r.delivered),
          }));
    return this.result(report, Object.keys(rows[0] ?? {}), rows);
  }

  private async deliveryStatistics(
    instituteId: string,
    q: AlumniReportQueryDto,
  ) {
    const range = buildDateRange(q.from, q.to);
    const data = await this.prisma.$queryRaw<
      Array<{ channel: string; status: string; messages: number }>
    >`
      SELECT "channel"::text AS channel, "status"::text AS status, COUNT(*)::int AS messages
      FROM "alumni_communication_logs"
      WHERE "institute_id" = ${instituteId}
        ${q.newsletter_id ? Prisma.sql`AND "newsletter_id" = ${q.newsletter_id}` : Prisma.empty}
        ${sqlRange('"created_at"', range)}
      GROUP BY 1, 2 ORDER BY 1, 2`;
    const rows: CsvRow[] = data.map((r) => ({
      channel: r.channel,
      status: r.status,
      messages: r.messages,
    }));
    return this.result(
      'delivery-statistics',
      ['channel', 'status', 'messages'],
      rows,
    );
  }
}
