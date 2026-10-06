import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sports models have no institute_id field (not institute-scoped), same as
 * Front-Office/Inventory/Canteen/Library — all metrics are platform-wide.
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
    const [
      totalParticipants,
      totalHouses,
      tournamentsByStatus,
      startedInRange,
      fixturesByStatus,
      totalRecords,
      recentRecords,
      totalAwards,
      latestStandingsRaw,
    ] = await Promise.all([
      this.prisma.sportsParticipant.count(),
      this.prisma.sportsHouse.count(),
      this.prisma.sportsTournament.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.sportsTournament.count({ where: { start_date: this.dateRange(from, to) } }),
      this.prisma.sportsFixture.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.sportsRecord.count(),
      this.prisma.sportsRecord.findMany({
        take: 5,
        orderBy: { achieved_date: 'desc' },
        select: { record_id: true, description: true, value: true, achieved_date: true },
      }),
      this.prisma.sportsAward.count(),
      this.prisma.sportsHouseStanding.findMany({
        orderBy: [{ academic_year: 'desc' }, { rank: 'asc' }],
        include: { house: { select: { name: true, color_code: true } } },
      }),
    ]);

    const tournamentStatusMap = Object.fromEntries(tournamentsByStatus.map((r) => [r.status, r._count._all]));
    const latestYear = latestStandingsRaw[0]?.academic_year;
    const standings = latestStandingsRaw
      .filter((s) => s.academic_year === latestYear)
      .map((s) => ({ house: s.house.name, color: s.house.color_code, total_points: s.total_points, rank: s.rank }));

    return {
      range: { from: from ?? null, to: to ?? null },
      participants: { total: totalParticipants },
      tournaments: {
        ongoing: tournamentStatusMap.ongoing ?? 0,
        upcoming: tournamentStatusMap.upcoming ?? 0,
        completed: tournamentStatusMap.completed ?? 0,
        started_in_range: startedInRange,
        by_status: tournamentsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      },
      houses: {
        total: totalHouses,
        academic_year: latestYear ?? null,
        standings,
      },
      fixtures: {
        by_status: fixturesByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      },
      records_and_awards: {
        total_records: totalRecords,
        total_awards: totalAwards,
        recent_records: recentRecords,
      },
    };
  }
}
