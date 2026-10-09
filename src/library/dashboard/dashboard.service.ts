import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Library models have no institute_id field (not institute-scoped), same as
 * Front-Office/Inventory/Canteen/Sports — all metrics are platform-wide.
 * `overdue` status is precomputed by lib-scheduler.service.ts, so counting
 * it directly is cheap.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }

  async getSummary(from?: string, to?: string) {
    const createdRange = this.dateRange(from, to);

    const [
      totalBooks,
      totalCopies,
      availableCopies,
      totalMembers,
      activeMembers,
      issuedByStatus,
      issuedInRange,
      returnedInRange,
      pendingFines,
      finesByStatus,
      reservationsByStatus,
    ] = await Promise.all([
      this.prisma.libBook.count(),
      this.prisma.libBookCopy.count(),
      this.prisma.libBookCopy.count({ where: { status: 'available' } }),
      this.prisma.libMember.count(),
      this.prisma.libMember.count({ where: { status: 'active' } }),
      this.prisma.libIssueRecord.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.libIssueRecord.count({ where: { issue_date: createdRange } }),
      this.prisma.libIssueRecord.count({ where: { return_date: createdRange } }),
      this.prisma.libFine.aggregate({
        _sum: { amount: true },
        where: { status: { in: ['pending', 'partially_paid'] } },
      }),
      this.prisma.libFine.groupBy({
        by: ['status'],
        where: { calculated_at: createdRange },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.libReservation.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const statusMap = Object.fromEntries(issuedByStatus.map((r) => [r.status, r._count._all]));
    const reservationMap = Object.fromEntries(reservationsByStatus.map((r) => [r.status, r._count._all]));

    return {
      range: { from: from ?? null, to: to ?? null },
      catalog: {
        total_books: totalBooks,
        total_copies: totalCopies,
        available_copies: availableCopies,
      },
      members: {
        total_members: totalMembers,
        active_members: activeMembers,
      },
      issues: {
        currently_issued: statusMap.issued ?? 0,
        overdue: statusMap.overdue ?? 0,
        lost: statusMap.lost ?? 0,
        issued_in_range: issuedInRange,
        returned_in_range: returnedInRange,
        by_status: issuedByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      },
      reservations: {
        pending: reservationMap.pending ?? 0,
        ready_for_pickup: reservationMap.ready_for_pickup ?? 0,
        by_status: reservationsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      },
      fines: {
        pending_total: Number(pendingFines._sum.amount ?? 0),
        by_status_in_range: finesByStatus.map((r) => ({
          status: r.status,
          count: r._count._all,
          amount: Number(r._sum.amount ?? 0),
        })),
      },
    };
  }
}
