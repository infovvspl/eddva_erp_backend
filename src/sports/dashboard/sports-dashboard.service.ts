import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';

const LIST_SIZE = 6;

export interface SportsDashboardSummary {
  totals: {
    sports: number;
    participants: number;
    houses: number;
    upcoming_tournaments: number;
    ongoing_tournaments: number;
    fixtures_scheduled: number;
    fixtures_completed: number;
  };
  house_standings: Array<{ house_id: number; name: string; total_points: number; rank: number | null }>;
  upcoming_fixtures: Array<{
    fixture_id: number;
    tournament_name: string;
    team_a: string;
    team_b: string;
    scheduled_date: Date;
  }>;
}

@Injectable()
export class SportsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every figure is limited to the caller's institute. */
  async getSummary(instituteId: string, academicYear = '2026-27'): Promise<SportsDashboardSummary> {
    const institute_id = requireInstituteId(instituteId);
    const now = new Date();

    const [
      sports,
      participants,
      houses,
      upcomingTournaments,
      ongoingTournaments,
      fixturesScheduled,
      fixturesCompleted,
      standings,
      upcomingFixtures,
    ] = await Promise.all([
      this.prisma.sportsSport.count({ where: { institute_id } }),
      this.prisma.sportsParticipant.count({ where: { institute_id } }),
      this.prisma.sportsHouse.count({ where: { institute_id } }),
      this.prisma.sportsTournament.count({ where: { institute_id, status: 'upcoming' } }),
      this.prisma.sportsTournament.count({ where: { institute_id, status: 'ongoing' } }),
      this.prisma.sportsFixture.count({ where: { institute_id, status: 'scheduled' } }),
      this.prisma.sportsFixture.count({ where: { institute_id, status: 'completed' } }),
      this.prisma.sportsHouseStanding.findMany({
        where: { institute_id, academic_year: academicYear },
        include: { house: { select: { name: true } } },
        orderBy: { total_points: 'desc' },
      }),
      this.prisma.sportsFixture.findMany({
        where: { institute_id, status: 'scheduled', scheduled_date: { gte: now } },
        include: {
          tournament: { select: { name: true } },
          team_a: { select: { team_name: true } },
          team_b: { select: { team_name: true } },
        },
        orderBy: { scheduled_date: 'asc' },
        take: LIST_SIZE,
      }),
    ]);

    return {
      totals: {
        sports,
        participants,
        houses,
        upcoming_tournaments: upcomingTournaments,
        ongoing_tournaments: ongoingTournaments,
        fixtures_scheduled: fixturesScheduled,
        fixtures_completed: fixturesCompleted,
      },
      house_standings: standings.map((s) => ({ house_id: s.house_id, name: s.house.name, total_points: s.total_points, rank: s.rank })),
      upcoming_fixtures: upcomingFixtures.map((f) => ({
        fixture_id: f.fixture_id,
        tournament_name: f.tournament.name,
        team_a: f.team_a.team_name,
        team_b: f.team_b.team_name,
        scheduled_date: f.scheduled_date,
      })),
    };
  }
}
