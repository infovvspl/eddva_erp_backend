import { ForbiddenException } from '@nestjs/common';
import { SportsDashboardService } from './sports-dashboard.service';

function makePrisma() {
  return {
    sportsSport: { count: jest.fn().mockResolvedValue(5) },
    sportsParticipant: { count: jest.fn().mockResolvedValue(80) },
    sportsHouse: { count: jest.fn().mockResolvedValue(4) },
    sportsTournament: { count: jest.fn().mockResolvedValue(0) },
    sportsFixture: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    sportsHouseStanding: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('SportsDashboardService', () => {
  it('scopes every query to the caller\'s institute', async () => {
    const prisma = makePrisma();
    await new SportsDashboardService(prisma as any).getSummary('inst-a');

    const wheres = [
      prisma.sportsSport.count.mock.calls[0][0].where,
      prisma.sportsParticipant.count.mock.calls[0][0].where,
      prisma.sportsHouse.count.mock.calls[0][0].where,
      ...prisma.sportsTournament.count.mock.calls.map((c: any) => c[0].where),
      ...prisma.sportsFixture.count.mock.calls.map((c: any) => c[0].where),
      prisma.sportsFixture.findMany.mock.calls[0][0].where,
      prisma.sportsHouseStanding.findMany.mock.calls[0][0].where,
    ];
    expect(wheres.length).toBeGreaterThan(6);
    for (const where of wheres) expect(where.institute_id).toBe('inst-a');
  });

  it('shapes the standings and upcoming fixtures lists', async () => {
    const prisma = makePrisma();
    prisma.sportsHouseStanding.findMany.mockResolvedValue([
      { house_id: 1, total_points: 40, rank: 1, house: { name: 'Red House' } },
    ]);
    prisma.sportsFixture.findMany.mockResolvedValue([
      {
        fixture_id: 9,
        scheduled_date: new Date('2026-10-01'),
        tournament: { name: 'Annual Meet' },
        team_a: { team_name: 'Red' },
        team_b: { team_name: 'Blue' },
      },
    ]);

    const summary = await new SportsDashboardService(prisma as any).getSummary('inst-a');

    expect(summary.totals).toMatchObject({ sports: 5, participants: 80, houses: 4 });
    expect(summary.house_standings[0]).toMatchObject({ name: 'Red House', total_points: 40, rank: 1 });
    expect(summary.upcoming_fixtures[0]).toMatchObject({ tournament_name: 'Annual Meet', team_a: 'Red', team_b: 'Blue' });
  });

  it('refuses a session with no institute', async () => {
    const prisma = makePrisma();
    await expect(new SportsDashboardService(prisma as any).getSummary('')).rejects.toThrow(ForbiddenException);
    expect(prisma.sportsSport.count).not.toHaveBeenCalled();
  });
});
