import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SEAT_HOLDING_STATUSES } from '../common/alumni-state';
import { sqlUtc } from '../common/sql-time';
import { localToday } from '../common/time.util';
import { summariseLogs } from '../communication/newsletters.service';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 15;

/**
 * Dashboard statistics. Every figure is a database aggregate scoped to one
 * institute — nothing loads a table into memory. Donation figures come from the
 * donation LEDGER (received donations), never from the cached campaign totals,
 * and never expose who gave anonymously.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async directory(instituteId: string) {
    const base = { institute_id: instituteId };
    const active = { ...base, is_active: true };
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [
      total,
      byVerification,
      activeProfiles,
      newLast30,
      byBatch,
      byProgram,
      byIndustry,
      byLocation,
    ] = await Promise.all([
      this.prisma.alumniProfile.count({ where: base }),
      this.prisma.alumniProfile.groupBy({
        by: ['verification_status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.alumniProfile.count({ where: active }),
      this.prisma.alumniProfile.count({
        where: { ...base, registered_at: { gte: since } },
      }),
      this.prisma.alumniProfile.groupBy({
        by: ['batch_year'],
        where: active,
        _count: { _all: true },
        orderBy: { batch_year: 'desc' },
        take: 25,
      }),
      this.prisma.alumniProfile.groupBy({
        by: ['program'],
        where: { ...active, program: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { program: 'desc' } },
        take: TOP,
      }),
      this.prisma.alumniProfile.groupBy({
        by: ['industry'],
        where: { ...active, industry: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { industry: 'desc' } },
        take: TOP,
      }),
      this.prisma.alumniProfile.groupBy({
        by: ['country', 'city'],
        where: { ...active, city: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { city: 'desc' } },
        take: TOP,
      }),
    ]);
    const v = Object.fromEntries(
      byVerification.map((r) => [r.verification_status, r._count._all]),
    ) as Record<string, number>;
    return {
      total_alumni: total,
      verified: v.verified ?? 0,
      pending_verification: v.pending ?? 0,
      rejected: v.rejected ?? 0,
      active_profiles: activeProfiles,
      registered_last_30_days: newLast30,
      by_batch: byBatch.map((r) => ({
        batch_year: r.batch_year,
        count: r._count._all,
      })),
      by_program: byProgram.map((r) => ({
        program: r.program,
        count: r._count._all,
      })),
      by_industry: byIndustry.map((r) => ({
        industry: r.industry,
        count: r._count._all,
      })),
      by_location: byLocation.map((r) => ({
        country: r.country,
        city: r.city,
        count: r._count._all,
      })),
    };
  }

  async events(instituteId: string) {
    const now = new Date();
    const upcoming = {
      institute_id: instituteId,
      status: 'upcoming' as const,
      event_date: { gt: now },
    };
    const [
      upcomingCount,
      capacity,
      unlimited,
      upcomingRegistrations,
      attendance,
      revenue,
      pendingRevenue,
      next,
    ] = await Promise.all([
      this.prisma.alumniEvent.count({ where: upcoming }),
      this.prisma.alumniEvent.aggregate({
        where: { ...upcoming, max_capacity: { not: null } },
        _sum: { max_capacity: true },
      }),
      this.prisma.alumniEvent.count({
        where: { ...upcoming, max_capacity: null },
      }),
      this.prisma.alumniEventRegistration.count({
        where: {
          institute_id: instituteId,
          attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
          event: { status: 'upcoming', event_date: { gt: now } },
        },
      }),
      this.prisma.alumniEventRegistration.groupBy({
        by: ['attendance_status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.alumniEventPayment.aggregate({
        where: { institute_id: instituteId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.alumniEventRegistration.aggregate({
        where: {
          institute_id: instituteId,
          payment_status: 'pending',
          attendance_status: { not: 'cancelled' },
          event: { status: { not: 'cancelled' } },
        },
        _sum: { amount_due: true },
        _count: { _all: true },
      }),
      this.prisma.alumniEvent.findMany({
        where: upcoming,
        orderBy: { event_date: 'asc' },
        take: 5,
        select: {
          event_id: true,
          title: true,
          event_date: true,
          max_capacity: true,
          is_paid: true,
          _count: {
            select: {
              registrations: {
                where: {
                  attendance_status: { in: [...SEAT_HOLDING_STATUSES] },
                },
              },
            },
          },
        },
      }),
    ]);
    const att = Object.fromEntries(
      attendance.map((r) => [r.attendance_status, r._count._all]),
    ) as Record<string, number>;
    return {
      upcoming_events: upcomingCount,
      registrations_for_upcoming_events: upcomingRegistrations,
      upcoming_capacity: {
        total_seats: num(capacity._sum.max_capacity),
        seats_taken_across_capped_and_uncapped: upcomingRegistrations,
        events_with_unlimited_capacity: unlimited,
      },
      attendance: {
        registered: att.registered ?? 0,
        attended: att.attended ?? 0,
        no_show: att.no_show ?? 0,
        cancelled: att.cancelled ?? 0,
      },
      paid_event_revenue: num(revenue._sum.amount),
      paid_ticket_count: revenue._count._all,
      pending_ticket_revenue: num(pendingRevenue._sum.amount_due),
      pending_ticket_count: pendingRevenue._count._all,
      next_events: next.map(({ _count, ...e }) => ({
        ...e,
        registered: _count.registrations,
        seats_left:
          e.max_capacity == null
            ? null
            : Math.max(0, e.max_capacity - _count.registrations),
      })),
    };
  }

  async jobs(instituteId: string) {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * DAY_MS);
    const open = {
      institute_id: instituteId,
      status: 'open' as const,
      OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
    };
    const [openJobs, expiring, byType, applications, hired] = await Promise.all(
      [
        this.prisma.alumniJob.count({ where: open }),
        this.prisma.alumniJob.count({
          where: {
            institute_id: instituteId,
            status: 'open',
            expiry_date: { gt: now, lte: inSevenDays },
          },
        }),
        this.prisma.alumniJob.groupBy({
          by: ['job_type'],
          where: open,
          _count: { _all: true },
        }),
        this.prisma.alumniJobApplication.groupBy({
          by: ['status'],
          where: { institute_id: instituteId },
          _count: { _all: true },
        }),
        this.prisma.alumniJobApplication.count({
          where: { institute_id: instituteId, status: 'hired' },
        }),
      ],
    );
    return {
      open_jobs: openJobs,
      expiring_within_7_days: expiring,
      open_jobs_by_type: byType.map((r) => ({
        job_type: r.job_type,
        count: r._count._all,
      })),
      applications: Object.fromEntries(
        applications.map((r) => [r.status, r._count._all]),
      ),
      total_applications: applications.reduce((s, r) => s + r._count._all, 0),
      hired_candidates: hired,
    };
  }

  async mentorship(instituteId: string) {
    const [programs, mentors, matches] = await Promise.all([
      this.prisma.alumniMentorshipProgram.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.alumniMentorProfile.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.alumniMentorshipMatch.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
    ]);
    const map = (rows: Array<{ status: string; _count: { _all: number } }>) =>
      Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const p = map(programs);
    const m = map(mentors);
    const x = map(matches);
    return {
      active_programs: (p.open_for_signup ?? 0) + (p.active ?? 0),
      programs_by_status: p,
      available_mentors: m.available ?? 0,
      mentors_by_status: m,
      active_matches: x.active ?? 0,
      completed_matches: x.completed ?? 0,
      discontinued_matches: x.discontinued ?? 0,
    };
  }

  async donations(instituteId: string) {
    const today = localToday();
    const yearAgo = new Date(Date.now() - 365 * DAY_MS);
    const received = { institute_id: instituteId, status: 'received' as const };
    const [
      total,
      donors,
      pending,
      activeCampaigns,
      trend,
      anonymous,
      topDonors,
      general,
    ] = await Promise.all([
      this.prisma.alumniDonation.aggregate({
        where: received,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.alumniDonation.groupBy({
        by: ['alumni_id'],
        where: received,
      }),
      this.prisma.alumniDonation.aggregate({
        where: { institute_id: instituteId, status: 'pending' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.alumniCampaign.findMany({
        where: {
          institute_id: instituteId,
          status: 'active',
          end_date: { gte: today },
        },
        orderBy: { end_date: 'asc' },
        select: {
          campaign_id: true,
          title: true,
          goal_amount: true,
          end_date: true,
        },
      }),
      this.prisma.$queryRaw<
        Array<{ month: Date; total: Prisma.Decimal; count: number }>
      >`
          SELECT date_trunc('month', "received_at") AS month, SUM("amount") AS total, COUNT(*)::int AS count
          FROM "alumni_donations"
          WHERE "institute_id" = ${instituteId} AND "status" = 'received' AND "received_at" >= ${sqlUtc(yearAgo)}
          GROUP BY 1 ORDER BY 1`,
      this.prisma.alumniDonation.aggregate({
        where: { ...received, is_anonymous: true },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Anonymous donors are excluded from the named leaderboard.
      this.prisma.$queryRaw<
        Array<{
          alumni_id: number;
          full_name: string;
          total: Prisma.Decimal;
          donations: number;
        }>
      >`
          SELECT a."alumni_id", a."full_name", SUM(d."amount") AS total, COUNT(*)::int AS donations
          FROM "alumni_donations" d JOIN "alumni_profiles" a ON a."alumni_id" = d."alumni_id"
          WHERE d."institute_id" = ${instituteId} AND d."status" = 'received' AND NOT d."is_anonymous"
          GROUP BY a."alumni_id" ORDER BY total DESC LIMIT 10`,
      this.prisma.alumniDonation.aggregate({
        where: { ...received, campaign_id: null },
        _sum: { amount: true },
      }),
    ]);
    // Progress of each active campaign from the ledger.
    const ledger = activeCampaigns.length
      ? await this.prisma.alumniDonation.groupBy({
          by: ['campaign_id'],
          where: {
            ...received,
            campaign_id: { in: activeCampaigns.map((c) => c.campaign_id) },
          },
          _sum: { amount: true },
        })
      : [];
    const raised = new Map(
      ledger.map((l) => [l.campaign_id, num(l._sum.amount)]),
    );
    return {
      active_campaigns: activeCampaigns.length,
      total_donations_amount: num(total._sum.amount),
      total_donations_count: total._count._all,
      donor_count: donors.length,
      pending_pledges: {
        count: pending._count._all,
        amount: num(pending._sum.amount),
      },
      general_fund_amount: num(general._sum.amount),
      anonymous_donations: {
        count: anonymous._count._all,
        amount: num(anonymous._sum.amount),
      },
      campaign_progress: activeCampaigns.map((c) => {
        const goal = Number(c.goal_amount);
        const got = raised.get(c.campaign_id) ?? 0;
        return {
          campaign_id: c.campaign_id,
          title: c.title,
          goal_amount: goal,
          raised_amount: got,
          progress_pct: goal > 0 ? Number(((got / goal) * 100).toFixed(2)) : 0,
          end_date: c.end_date,
        };
      }),
      donation_trend_12_months: trend.map((t) => ({
        month: t.month.toISOString().slice(0, 7),
        total: num(t.total),
        count: t.count,
      })),
      top_donors: topDonors.map((d) => ({
        alumni_id: d.alumni_id,
        name: d.full_name,
        total: num(d.total),
        donations: d.donations,
      })),
    };
  }

  async communication(instituteId: string) {
    const [newsletters, logs, recent, failed] = await Promise.all([
      this.prisma.alumniNewsletter.groupBy({
        by: ['status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.alumniCommunicationLog.groupBy({
        by: ['channel', 'status'],
        where: { institute_id: instituteId },
        _count: { _all: true },
      }),
      this.prisma.alumniNewsletter.findMany({
        where: { institute_id: instituteId, status: 'sent' },
        orderBy: { sent_at: 'desc' },
        take: 5,
        select: {
          newsletter_id: true,
          title: true,
          sent_at: true,
          recipient_count: true,
        },
      }),
      this.prisma.alumniCommunicationLog.count({
        where: { institute_id: instituteId, status: 'failed' },
      }),
    ]);
    const nl = Object.fromEntries(
      newsletters.map((r) => [r.status, r._count._all]),
    ) as Record<string, number>;
    const stats = summariseLogs(logs);
    return {
      newsletters_sent: nl.sent ?? 0,
      newsletters_draft: nl.draft ?? 0,
      delivery: {
        total_messages: stats.total_messages,
        queued: stats.by_status.queued,
        delivered: stats.delivered,
        delivery_rate: stats.delivery_rate,
      },
      opens: { count: stats.opened, rate: stats.open_rate },
      clicks: { count: stats.clicked, rate: stats.click_rate },
      failed_deliveries: failed,
      by_channel: stats.by_channel,
      recent_newsletters: recent,
    };
  }

  async summary(instituteId: string) {
    const [directory, events, jobs, mentorship, donations, communication] =
      await Promise.all([
        this.directory(instituteId),
        this.events(instituteId),
        this.jobs(instituteId),
        this.mentorship(instituteId),
        this.donations(instituteId),
        this.communication(instituteId),
      ]);
    return {
      alumni: {
        total: directory.total_alumni,
        verified: directory.verified,
        pending_verification: directory.pending_verification,
      },
      events: {
        upcoming: events.upcoming_events,
        registrations_for_upcoming: events.registrations_for_upcoming_events,
        revenue: events.paid_event_revenue,
      },
      jobs: {
        open: jobs.open_jobs,
        applications: jobs.total_applications,
        hired: jobs.hired_candidates,
      },
      mentorship: {
        active_programs: mentorship.active_programs,
        available_mentors: mentorship.available_mentors,
        active_matches: mentorship.active_matches,
      },
      donations: {
        active_campaigns: donations.active_campaigns,
        total: donations.total_donations_amount,
        donors: donations.donor_count,
      },
      communication: {
        newsletters_sent: communication.newsletters_sent,
        failed_deliveries: communication.failed_deliveries,
      },
    };
  }
}
