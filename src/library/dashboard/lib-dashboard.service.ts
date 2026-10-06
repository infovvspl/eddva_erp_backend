import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { addDays } from '../../common/utils/date.util';

const DUE_SOON_DAYS = 3;
const LIST_SIZE = 6;

export interface LibraryDashboardSummary {
  totals: {
    titles: number;
    copies: number;
    available_copies: number;
    issued_now: number;
    overdue: number;
    active_members: number;
    pending_reservations: number;
    unpaid_fines: number;
  };
  due_soon: Array<{ issue_id: number; title: string; member_name: string; due_date: Date }>;
  recent_issues: Array<{
    issue_id: number;
    title: string;
    member_name: string;
    issue_date: Date;
    return_date: Date | null;
    status: string;
  }>;
}

@Injectable()
export class LibDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every figure is limited to the caller's institute. */
  async getSummary(instituteId: string): Promise<LibraryDashboardSummary> {
    const institute_id = requireInstituteId(instituteId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueSoonUntil = addDays(today, DUE_SOON_DAYS);
    const openLoan = { in: ['issued', 'overdue'] as Array<'issued' | 'overdue'> };
    const unpaidFineWhere = { institute_id, status: { in: ['pending', 'partially_paid'] as Array<'pending' | 'partially_paid'> } };

    const [
      titles,
      copies,
      availableCopies,
      issuedNow,
      overdue,
      activeMembers,
      pendingReservations,
      unpaidFineTotal,
      unpaidFinePayments,
      dueSoon,
      recent,
    ] = await Promise.all([
      this.prisma.libBook.count({ where: { institute_id } }),
      this.prisma.libBookCopy.count({ where: { institute_id } }),
      this.prisma.libBookCopy.count({ where: { institute_id, status: 'available' } }),
      this.prisma.libIssueRecord.count({ where: { institute_id, status: openLoan } }),
      // The nightly job flips 'issued' to 'overdue'; count past-due loans that it has not reached yet too.
      this.prisma.libIssueRecord.count({
        where: {
          institute_id,
          OR: [{ status: 'overdue' }, { status: 'issued', due_date: { lt: today } }],
        },
      }),
      this.prisma.libMember.count({ where: { institute_id, status: 'active' } }),
      this.prisma.libReservation.count({
        where: { institute_id, status: { in: ['pending', 'ready_for_pickup'] } },
      }),
      this.prisma.libFine.aggregate({ where: unpaidFineWhere, _sum: { amount: true } }),
      this.prisma.libFinePayment.aggregate({
        where: { fine: unpaidFineWhere },
        _sum: { amount_paid: true },
      }),
      this.prisma.libIssueRecord.findMany({
        where: { institute_id, status: 'issued', due_date: { gte: today, lte: dueSoonUntil } },
        include: {
          copy: { select: { book: { select: { title: true } } } },
          member: { select: { name: true } },
        },
        orderBy: { due_date: 'asc' },
        take: LIST_SIZE,
      }),
      this.prisma.libIssueRecord.findMany({
        where: { institute_id },
        include: {
          copy: { select: { book: { select: { title: true } } } },
          member: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: LIST_SIZE,
      }),
    ]);

    const outstanding = Number(unpaidFineTotal._sum.amount ?? 0) - Number(unpaidFinePayments._sum.amount_paid ?? 0);

    return {
      totals: {
        titles,
        copies,
        available_copies: availableCopies,
        issued_now: issuedNow,
        overdue,
        active_members: activeMembers,
        pending_reservations: pendingReservations,
        unpaid_fines: Math.max(0, Math.round(outstanding * 100) / 100),
      },
      due_soon: dueSoon.map((i) => ({
        issue_id: i.issue_id,
        title: i.copy.book.title,
        member_name: i.member.name,
        due_date: i.due_date,
      })),
      recent_issues: recent.map((i) => ({
        issue_id: i.issue_id,
        title: i.copy.book.title,
        member_name: i.member.name,
        issue_date: i.issue_date,
        return_date: i.return_date,
        status: i.status,
      })),
    };
  }
}
