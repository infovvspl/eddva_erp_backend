import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildDateRange } from '../common/pagination.util';
import { AdmissionReportQueryDto } from '../reports/dto/report-query.dto';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * KPI cards, the funnel and recent activity. Built from the same funnel and
   * seat reports (so the numbers always agree with the Reports pages) plus a few
   * live counts. Filters: session, program, date range.
   *
   * When no session_id is supplied the dashboard defaults to the institute's
   * current 'active' session (or the most-recently-created one as a fallback)
   * so it never shows a confusing mix of data across old sessions.
   */
  async summary(instituteId: string, q: AdmissionReportQueryDto) {
    const now = new Date();

    // ── Auto-resolve session ────────────────────────────────────────────────
    // Prefer the caller-supplied session; otherwise find the active one so we
    // don't aggregate records across every historical session by default.
    let resolvedSessionId = q.session_id;
    if (!resolvedSessionId) {
      const activeSession = await this.prisma.admissionAcademicSession.findFirst({
        where: { institute_id: instituteId, deleted_at: null, status: 'active' },
        orderBy: { start_date: 'desc' },
        select: { session_id: true },
      });
      if (!activeSession) {
        // Fallback: most recently created session (covers institutes that haven't
        // set a session to 'active' yet).
        const latestSession = await this.prisma.admissionAcademicSession.findFirst({
          where: { institute_id: instituteId, deleted_at: null },
          orderBy: { created_at: 'desc' },
          select: { session_id: true },
        });
        resolvedSessionId = latestSession?.session_id;
      } else {
        resolvedSessionId = activeSession.session_id;
      }
    }

    // Build an effective query that always has a session scope.
    const effectiveQ: AdmissionReportQueryDto = { ...q, session_id: resolvedSessionId };

    const applicationScope: Prisma.AdmissionApplicationWhereInput = {
      institute_id: instituteId,
      deleted_at: null,
      session_id: resolvedSessionId,
      program_id: q.program_id,
    };

    const [
      funnel,
      seats,
      newEnquiries,
      testsScheduled,
      interviewsScheduled,
      followupsDue,
      feesPaid,
      recentApplications,
      recentConfirmations,
    ] = await Promise.all([
      this.reports.funnel(instituteId, effectiveQ),
      this.reports.seats(instituteId, effectiveQ),
      this.prisma.admissionEnquiry.count({
        where: {
          institute_id: instituteId,
          deleted_at: null,
          status: 'new',
          program_id: q.program_id,
          created_at: buildDateRange(q.from, q.to),
        },
      }),
      this.prisma.admissionEntranceTest.count({
        where: {
          institute_id: instituteId,
          deleted_at: null,
          session_id: resolvedSessionId,
          program_id: q.program_id,
          test_date: { gte: now },
        },
      }),
      this.prisma.admissionInterview.count({
        where: {
          status: { in: ['scheduled', 'rescheduled'] },
          scheduled_datetime: { gte: now },
          application: applicationScope,
        },
      }),
      this.prisma.admissionEnquiry.count({
        where: {
          institute_id: instituteId,
          deleted_at: null,
          program_id: q.program_id,
          status: { in: ['new', 'contacted', 'application_started'] },
          followups: { some: { next_followup_date: { lte: now } } },
        },
      }),
      this.prisma.admissionPayment.aggregate({
        where: { application: applicationScope },
        _sum: { amount_paid: true },
        _count: { _all: true },
      }),
      this.prisma.admissionApplication.findMany({
        where: applicationScope,
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
          application_id: true,
          application_number: true,
          status: true,
          application_date: true,
          applicant: { select: { name: true } },
          program: { select: { name: true } },
        },
      }),
      this.prisma.admissionConfirmation.findMany({
        where: { status: 'confirmed', application: applicationScope },
        orderBy: { confirmed_date: 'desc' },
        take: 5,
        select: {
          confirmation_id: true,
          enrollment_number: true,
          confirmed_date: true,
          application: {
            select: {
              application_number: true,
              applicant: { select: { name: true } },
              program: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const t = funnel.totals;
    const byStatus = funnel.applications_by_status as Record<string, number>;

    return {
      filters: {
        session_id: resolvedSessionId,
        program_id: q.program_id,
        from: q.from,
        to: q.to,
      },
      kpis: {
        total_enquiries: t.enquiries,
        new_enquiries: newEnquiries,
        enquiry_followups_due: followupsDue,
        applications: t.applications,
        applications_under_review: byStatus.under_review ?? 0,
        tests_scheduled: testsScheduled,
        interviews_scheduled: interviewsScheduled,
        shortlisted: t.shortlisted,
        offers_issued: t.offers,
        offers_accepted: t.accepted,
        admission_fees_paid: {
          applications_fully_paid: t.fee_paid,
          payments_recorded: feesPaid._count._all,
          amount_collected: feesPaid._sum.amount_paid ?? new Prisma.Decimal(0),
        },
        confirmed_admissions: t.confirmed,
        available_seats: seats.totals.available,
      },
      funnel: [
        { stage: 'enquiry', count: t.enquiries },
        { stage: 'application', count: t.applications },
        { stage: 'test_or_interview', count: t.assessed },
        { stage: 'shortlisted', count: t.shortlisted },
        { stage: 'offer', count: t.offers },
        { stage: 'fee_paid', count: t.fee_paid },
        { stage: 'confirmed_admission', count: t.confirmed },
      ],
      applications_by_status: funnel.applications_by_status,
      seats: seats.totals,
      recent: {
        applications: recentApplications,
        confirmations: recentConfirmations,
      },
    };
  }
}
