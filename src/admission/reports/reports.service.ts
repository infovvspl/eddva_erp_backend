import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toCsv } from '../common/csv.util';
import {
  buildDateRange,
  buildMeta,
  parseDateParam,
  parsePagination,
} from '../common/pagination.util';
import { AdmissionReportQueryDto, ReportName } from './dto/report-query.dto';

interface FunnelCounts {
  applications: number;
  assessed: number;
  shortlisted: number;
  offers: number;
  accepted: number;
  fee_paid: number;
  confirmed: number;
}

const EMPTY_FUNNEL: FunnelCounts = {
  applications: 0,
  assessed: 0,
  shortlisted: 0,
  offers: 0,
  accepted: 0,
  fee_paid: 0,
  confirmed: 0,
};

/** Upper bound on rows in a CSV export of the admissions list. */
const EXPORT_ROW_CAP = 10000;

interface EnquiryGroupRow {
  program_id: number | null;
  source: string;
  status: string;
  _count: { _all: number };
}

/** The funnel counters of a grouped row (dropping its group key); all zeros when the group has no applications. */
const pickCounts = (row?: FunnelCounts): FunnelCounts => ({
  applications: row?.applications ?? 0,
  assessed: row?.assessed ?? 0,
  shortlisted: row?.shortlisted ?? 0,
  offers: row?.offers ?? 0,
  accepted: row?.accepted ?? 0,
  fee_paid: row?.fee_paid ?? 0,
  confirmed: row?.confirmed ?? 0,
});

const pct = (num: number, den: number) =>
  den === 0 ? 0 : Math.round((num / den) * 1000) / 10;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Funnel ───────────────────────────────────────────────────────────────

  /** One row per application with a flag for every funnel stage it has reached. */
  private applicationFacts(instituteId: string, q: AdmissionReportQueryDto) {
    const from = parseDateParam(q.from, 'from');
    const to = parseDateParam(q.to, 'to', true);
    const conds: Prisma.Sql[] = [
      Prisma.sql`a.institute_id = ${instituteId}`,
      Prisma.sql`a.deleted_at IS NULL`,
    ];
    if (q.session_id) conds.push(Prisma.sql`a.session_id = ${q.session_id}`);
    if (q.program_id) conds.push(Prisma.sql`a.program_id = ${q.program_id}`);
    if (q.source === 'direct') conds.push(Prisma.sql`e.enquiry_id IS NULL`);
    else if (q.source) conds.push(Prisma.sql`e.source::text = ${q.source}`);
    if (from) conds.push(Prisma.sql`a.application_date >= ${from}`);
    if (to) conds.push(Prisma.sql`a.application_date <= ${to}`);

    return Prisma.sql`
      SELECT
        a.program_id,
        COALESCE(e.source::text, 'direct') AS source,
        a.status::text AS status,
        (EXISTS (SELECT 1 FROM admission_test_registrations r WHERE r.application_id = a.application_id)
          OR EXISTS (SELECT 1 FROM admission_interviews i WHERE i.application_id = a.application_id)) AS assessed,
        (a.status IN ('shortlisted', 'offered', 'admitted') OR o.offer_id IS NOT NULL) AS shortlisted,
        (o.offer_id IS NOT NULL) AS offered,
        (o.status = 'accepted') AS accepted,
        (o.status = 'accepted' AND fs.amount IS NOT NULL AND COALESCE(p.paid, 0) >= fs.amount) AS fee_paid,
        (c.status = 'confirmed') AS confirmed
      FROM admission_applications a
      LEFT JOIN admission_enquiries e ON e.enquiry_id = a.source_enquiry_id
      LEFT JOIN admission_offers o ON o.application_id = a.application_id
      LEFT JOIN admission_fee_structures fs ON fs.program_id = a.program_id AND fs.session_id = a.session_id
      LEFT JOIN (
        SELECT application_id, SUM(amount_paid) AS paid FROM admission_payments GROUP BY application_id
      ) p ON p.application_id = a.application_id
      LEFT JOIN admission_confirmations c ON c.application_id = a.application_id
      WHERE ${Prisma.join(conds, ' AND ')}
    `;
  }

  private async funnelGroupedBy(
    instituteId: string,
    q: AdmissionReportQueryDto,
    column: 'program_id' | 'source',
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<
        { key: number | string | null } & Record<keyof FunnelCounts, number>
      >
    >(Prisma.sql`
      WITH facts AS (${this.applicationFacts(instituteId, q)})
      SELECT
        ${Prisma.raw(column)} AS key,
        COUNT(*)::int AS applications,
        COUNT(*) FILTER (WHERE assessed)::int AS assessed,
        COUNT(*) FILTER (WHERE shortlisted)::int AS shortlisted,
        COUNT(*) FILTER (WHERE offered)::int AS offers,
        COUNT(*) FILTER (WHERE accepted)::int AS accepted,
        COUNT(*) FILTER (WHERE fee_paid)::int AS fee_paid,
        COUNT(*) FILTER (WHERE confirmed)::int AS confirmed
      FROM facts
      GROUP BY ${Prisma.raw(column)}
    `);
    return rows;
  }

  /**
   * Enquiry → application → assessed → shortlisted → offer → accepted → fee paid
   * → confirmed, with breakdowns by program and by enquiry source. Enquiries have
   * no session, so the session filter narrows the application side only.
   */
  async funnel(instituteId: string, q: AdmissionReportQueryDto) {
    const enquiryWhere: Prisma.AdmissionEnquiryWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      program_id: q.program_id,
      created_at: buildDateRange(q.from, q.to),
      ...(q.source && q.source !== 'direct' ? { source: q.source } : {}),
    };
    const includeEnquiries = q.source !== 'direct';

    const grouped = includeEnquiries
      ? await this.prisma.admissionEnquiry.groupBy({
          by: ['program_id', 'source', 'status'],
          where: enquiryWhere,
          _count: { _all: true },
        })
      : [];
    const enquiryRows: EnquiryGroupRow[] = grouped;

    const [byProgramRows, bySourceRows, statusRows] = await Promise.all([
      this.funnelGroupedBy(instituteId, q, 'program_id'),
      this.funnelGroupedBy(instituteId, q, 'source'),
      this.prisma.$queryRaw<
        Array<{ status: string; count: number }>
      >(Prisma.sql`
        WITH facts AS (${this.applicationFacts(instituteId, q)})
        SELECT status, COUNT(*)::int AS count FROM facts GROUP BY status
      `),
    ]);

    const sumEnquiries = (
      match: (r: (typeof enquiryRows)[number]) => boolean,
      convertedOnly = false,
    ) =>
      enquiryRows
        .filter((r) => match(r) && (!convertedOnly || r.status === 'converted'))
        .reduce((n, r) => n + r._count._all, 0);

    const total = (rows: typeof byProgramRows): FunnelCounts =>
      rows.reduce(
        (acc, r) => ({
          applications: acc.applications + r.applications,
          assessed: acc.assessed + r.assessed,
          shortlisted: acc.shortlisted + r.shortlisted,
          offers: acc.offers + r.offers,
          accepted: acc.accepted + r.accepted,
          fee_paid: acc.fee_paid + r.fee_paid,
          confirmed: acc.confirmed + r.confirmed,
        }),
        { ...EMPTY_FUNNEL },
      );

    const programIds = [
      ...new Set([
        ...byProgramRows.map((r) => r.key as number | null),
        ...enquiryRows.map((r) => r.program_id),
      ]),
    ];
    const programs = await this.prisma.admissionProgram.findMany({
      where: {
        institute_id: instituteId,
        program_id: {
          in: programIds.filter((id): id is number => id !== null),
        },
      },
      select: { program_id: true, name: true },
    });
    const programName = new Map(programs.map((p) => [p.program_id, p.name]));

    const by_program = programIds
      .map((programId) => {
        const counts = pickCounts(
          byProgramRows.find((r) => r.key === programId),
        );
        return {
          program_id: programId,
          program_name:
            programId === null
              ? 'Unspecified'
              : (programName.get(programId) ?? `#${programId}`),
          enquiries: sumEnquiries((r) => r.program_id === programId),
          ...counts,
        };
      })
      .sort((a, b) => a.program_name.localeCompare(b.program_name));

    const sources = [
      ...new Set([
        ...bySourceRows.map((r) => String(r.key)),
        ...enquiryRows.map((r) => r.source),
      ]),
    ];
    const by_source = sources.map((source) => {
      const counts = pickCounts(bySourceRows.find((r) => r.key === source));
      return {
        source,
        enquiries: sumEnquiries((r) => r.source === source),
        converted_enquiries: sumEnquiries((r) => r.source === source, true),
        ...counts,
      };
    });

    const enquiries = sumEnquiries(() => true);
    const converted = sumEnquiries(() => true, true);
    const totals = {
      enquiries,
      converted_enquiries: converted,
      ...total(byProgramRows),
    };

    return {
      filters: {
        session_id: q.session_id,
        program_id: q.program_id,
        source: q.source,
        from: q.from,
        to: q.to,
      },
      totals,
      conversion_rates_pct: {
        enquiry_to_application: pct(converted, enquiries),
        application_to_offer: pct(totals.offers, totals.applications),
        offer_to_acceptance: pct(totals.accepted, totals.offers),
        offer_to_admission: pct(totals.confirmed, totals.offers),
        application_to_admission: pct(totals.confirmed, totals.applications),
      },
      applications_by_status: Object.fromEntries(
        statusRows.map((r) => [r.status, r.count]),
      ),
      by_program,
      by_source,
    };
  }

  // ─── Seats ────────────────────────────────────────────────────────────────

  /**
   * total = program capacity per session; offered = offers outstanding; accepted =
   * accepted but not yet confirmed; confirmed = confirmed admissions;
   * available = total − offered − accepted − confirmed (same accounting as offer issuing).
   */
  async seats(instituteId: string, q: AdmissionReportQueryDto) {
    const conds: Prisma.Sql[] = [
      Prisma.sql`p.institute_id = ${instituteId}`,
      Prisma.sql`p.deleted_at IS NULL`,
      Prisma.sql`s.institute_id = ${instituteId}`,
      Prisma.sql`s.deleted_at IS NULL`,
    ];
    if (q.session_id) conds.push(Prisma.sql`s.session_id = ${q.session_id}`);
    if (q.program_id) conds.push(Prisma.sql`p.program_id = ${q.program_id}`);

    const rows = await this.prisma.$queryRaw<
      Array<{
        program_id: number;
        program_name: string;
        session_id: number;
        session_name: string;
        total_seats: number;
        offered: number;
        accepted: number;
        confirmed: number;
      }>
    >(Prisma.sql`
      WITH held AS (
        SELECT a.program_id, a.session_id,
          COUNT(*) FILTER (WHERE o.status = 'offered' AND a.status = 'offered')::int AS offered,
          COUNT(*) FILTER (WHERE o.status = 'accepted' AND a.status = 'offered')::int AS accepted,
          COUNT(*) FILTER (WHERE a.status = 'admitted' AND c.status = 'confirmed')::int AS confirmed
        FROM admission_applications a
        LEFT JOIN admission_offers o ON o.application_id = a.application_id
        LEFT JOIN admission_confirmations c ON c.application_id = a.application_id
        WHERE a.institute_id = ${instituteId} AND a.deleted_at IS NULL
        GROUP BY a.program_id, a.session_id
      )
      SELECT p.program_id, p.name AS program_name, s.session_id, s.name AS session_name, p.total_seats,
        COALESCE(h.offered, 0)::int AS offered,
        COALESCE(h.accepted, 0)::int AS accepted,
        COALESCE(h.confirmed, 0)::int AS confirmed
      FROM admission_programs p
      CROSS JOIN admission_academic_sessions s
      LEFT JOIN held h ON h.program_id = p.program_id AND h.session_id = s.session_id
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY s.start_date DESC, p.name ASC
    `);

    const data = rows.map((r) => ({
      ...r,
      available: Math.max(
        r.total_seats - r.offered - r.accepted - r.confirmed,
        0,
      ),
    }));
    const totals = data.reduce(
      (t, r) => ({
        total_seats: t.total_seats + r.total_seats,
        offered: t.offered + r.offered,
        accepted: t.accepted + r.accepted,
        confirmed: t.confirmed + r.confirmed,
        available: t.available + r.available,
      }),
      { total_seats: 0, offered: 0, accepted: 0, confirmed: 0, available: 0 },
    );
    return { totals, data };
  }

  // ─── Offers ───────────────────────────────────────────────────────────────

  async offers(instituteId: string, q: AdmissionReportQueryDto) {
    const from = parseDateParam(q.from, 'from');
    const to = parseDateParam(q.to, 'to', true);
    const conds: Prisma.Sql[] = [
      Prisma.sql`a.institute_id = ${instituteId}`,
      Prisma.sql`a.deleted_at IS NULL`,
    ];
    if (q.session_id) conds.push(Prisma.sql`a.session_id = ${q.session_id}`);
    if (q.program_id) conds.push(Prisma.sql`a.program_id = ${q.program_id}`);
    if (from) conds.push(Prisma.sql`o.offer_date >= ${from}`);
    if (to) conds.push(Prisma.sql`o.offer_date <= ${to}`);

    const data = await this.prisma.$queryRaw<
      Array<{
        program_id: number;
        program_name: string;
        session_id: number;
        session_name: string;
        issued: number;
        outstanding: number;
        accepted: number;
        declined: number;
        expired: number;
        expiring_within_3_days: number;
      }>
    >(Prisma.sql`
      SELECT p.program_id, p.name AS program_name, s.session_id, s.name AS session_name,
        COUNT(*)::int AS issued,
        COUNT(*) FILTER (WHERE o.status = 'offered')::int AS outstanding,
        COUNT(*) FILTER (WHERE o.status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE o.status = 'declined')::int AS declined,
        COUNT(*) FILTER (WHERE o.status = 'expired')::int AS expired,
        COUNT(*) FILTER (WHERE o.status = 'offered'
          AND o.offer_expiry_date > now() AND o.offer_expiry_date <= now() + interval '3 days')::int AS expiring_within_3_days
      FROM admission_offers o
      JOIN admission_applications a ON a.application_id = o.application_id
      JOIN admission_programs p ON p.program_id = a.program_id
      JOIN admission_academic_sessions s ON s.session_id = a.session_id
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY p.program_id, p.name, s.session_id, s.name
      ORDER BY s.name DESC, p.name ASC
    `);

    const totals = data.reduce(
      (t, r) => ({
        issued: t.issued + r.issued,
        outstanding: t.outstanding + r.outstanding,
        accepted: t.accepted + r.accepted,
        declined: t.declined + r.declined,
        expired: t.expired + r.expired,
        expiring_within_3_days:
          t.expiring_within_3_days + r.expiring_within_3_days,
      }),
      {
        issued: 0,
        outstanding: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        expiring_within_3_days: 0,
      },
    );
    return { totals, data };
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  async documents(instituteId: string, q: AdmissionReportQueryDto) {
    const from = parseDateParam(q.from, 'from');
    const to = parseDateParam(q.to, 'to', true);
    const appConds: Prisma.Sql[] = [
      Prisma.sql`a.institute_id = ${instituteId}`,
      Prisma.sql`a.deleted_at IS NULL`,
    ];
    if (q.session_id) appConds.push(Prisma.sql`a.session_id = ${q.session_id}`);
    if (q.program_id) appConds.push(Prisma.sql`a.program_id = ${q.program_id}`);
    const docConds = [...appConds];
    if (from) docConds.push(Prisma.sql`d.uploaded_at >= ${from}`);
    if (to) docConds.push(Prisma.sql`d.uploaded_at <= ${to}`);

    const [by_type, [applications]] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          document_type: string;
          total: number;
          pending: number;
          verified: number;
          rejected: number;
          avg_verification_turnaround_hours: number | null;
        }>
      >(Prisma.sql`
        SELECT d.document_type::text AS document_type,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE d.verification_status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE d.verification_status = 'verified')::int AS verified,
          COUNT(*) FILTER (WHERE d.verification_status = 'rejected')::int AS rejected,
          (AVG(EXTRACT(EPOCH FROM (d.verified_at - d.uploaded_at))) FILTER (WHERE d.verified_at IS NOT NULL) / 3600.0)::float8
            AS avg_verification_turnaround_hours
        FROM admission_application_documents d
        JOIN admission_applications a ON a.application_id = d.application_id
        WHERE ${Prisma.join(docConds, ' AND ')}
        GROUP BY d.document_type
        ORDER BY d.document_type
      `),
      this.prisma.$queryRaw<
        Array<{
          applications: number;
          with_no_documents: number;
          with_pending_documents: number;
          with_rejected_documents: number;
          fully_verified: number;
        }>
      >(Prisma.sql`
        SELECT COUNT(*)::int AS applications,
          COUNT(*) FILTER (WHERE doc.total = 0)::int AS with_no_documents,
          COUNT(*) FILTER (WHERE doc.pending > 0)::int AS with_pending_documents,
          COUNT(*) FILTER (WHERE doc.rejected > 0)::int AS with_rejected_documents,
          COUNT(*) FILTER (WHERE doc.total > 0 AND doc.pending = 0 AND doc.rejected = 0)::int AS fully_verified
        FROM admission_applications a
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE verification_status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE verification_status = 'rejected') AS rejected
          FROM admission_application_documents d WHERE d.application_id = a.application_id
        ) doc ON true
        WHERE ${Prisma.join(appConds, ' AND ')}
      `),
    ]);

    const totals = by_type.reduce(
      (t, r) => ({
        total: t.total + r.total,
        pending: t.pending + r.pending,
        verified: t.verified + r.verified,
        rejected: t.rejected + r.rejected,
      }),
      { total: 0, pending: 0, verified: 0, rejected: 0 },
    );
    return { totals, applications, by_type };
  }

  // ─── Confirmed admissions ─────────────────────────────────────────────────

  async admissions(
    instituteId: string,
    q: AdmissionReportQueryDto,
    forExport = false,
  ) {
    const { skip, take, page, limit } = forExport
      ? { skip: 0, take: EXPORT_ROW_CAP, page: 1, limit: EXPORT_ROW_CAP }
      : parsePagination(q);
    const where: Prisma.AdmissionConfirmationWhereInput = {
      status: 'confirmed',
      confirmed_date: buildDateRange(q.from, q.to),
      application: {
        institute_id: instituteId,
        deleted_at: null,
        session_id: q.session_id,
        program_id: q.program_id,
      },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admissionConfirmation.findMany({
        where,
        orderBy: { confirmed_date: 'desc' },
        skip,
        take,
        include: {
          application: {
            select: {
              application_number: true,
              applicant: { select: { name: true } },
              program: { select: { name: true } },
              session: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.admissionConfirmation.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        confirmation_id: r.confirmation_id,
        enrollment_number: r.enrollment_number,
        confirmed_date: r.confirmed_date,
        application_number: r.application.application_number,
        applicant_name: r.application.applicant.name,
        program: r.application.program.name,
        session: r.application.session.name,
        student_link_status: r.student_link_status,
        student_ref: r.student_ref,
      })),
      pagination: buildMeta(total, page, limit),
    };
  }

  // ─── CSV export ───────────────────────────────────────────────────────────

  /** Flat CSV for any report. Same data, same filters, same institute scoping as the JSON endpoint. */
  async exportCsv(
    instituteId: string,
    report: ReportName,
    q: AdmissionReportQueryDto,
  ): Promise<string> {
    switch (report) {
      case 'funnel': {
        const f = await this.funnel(instituteId, q);
        return toCsv(
          f.by_program.map((r) => ({
            program: r.program_name,
            enquiries: r.enquiries,
            applications: r.applications,
            assessed: r.assessed,
            shortlisted: r.shortlisted,
            offers: r.offers,
            accepted: r.accepted,
            fee_paid: r.fee_paid,
            confirmed: r.confirmed,
          })),
        );
      }
      case 'seats': {
        const s = await this.seats(instituteId, q);
        return toCsv(
          s.data.map((r) => ({
            program: r.program_name,
            session: r.session_name,
            total_seats: r.total_seats,
            offered: r.offered,
            accepted: r.accepted,
            confirmed: r.confirmed,
            available: r.available,
          })),
        );
      }
      case 'offers': {
        const o = await this.offers(instituteId, q);
        return toCsv(
          o.data.map((r) => ({
            program: r.program_name,
            session: r.session_name,
            issued: r.issued,
            outstanding: r.outstanding,
            accepted: r.accepted,
            declined: r.declined,
            expired: r.expired,
          })),
        );
      }
      case 'documents': {
        const d = await this.documents(instituteId, q);
        return toCsv(
          d.by_type.map((r) => ({
            document_type: r.document_type,
            total: r.total,
            pending: r.pending,
            verified: r.verified,
            rejected: r.rejected,
            avg_verification_turnaround_hours:
              r.avg_verification_turnaround_hours,
          })),
        );
      }
      case 'admissions': {
        const a = await this.admissions(instituteId, q, true);
        return toCsv(a.data);
      }
    }
  }
}
