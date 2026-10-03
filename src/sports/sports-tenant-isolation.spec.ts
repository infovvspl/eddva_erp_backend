import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SportsCoreService } from './core/sports-core.service';
import { SportsHousesService } from './houses/sports-houses.service';
import { SportsTournamentsService } from './tournaments/sports-tournaments.service';
import { SportsRecordsService } from './records-awards/sports-records.service';

const A = 'inst-a';
const B = 'inst-b';

function model() {
  return { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), upsert: jest.fn(), aggregate: jest.fn() };
}
function makePrisma() {
  const prisma: any = {
    sportsSport: model(),
    sportsVenue: model(),
    sportsStaff: model(),
    sportsParticipant: model(),
    sportsHouse: model(),
    sportsHouseMembership: model(),
    sportsHousePoint: model(),
    sportsHouseStanding: model(),
    sportsTournament: model(),
    sportsTournamentTeam: model(),
    sportsTournamentTeamMember: model(),
    sportsFixture: model(),
    sportsFixtureResult: model(),
    sportsPlayerMatchStat: model(),
    sportsRecord: model(),
    sportsAward: model(),
  };
  for (const m of Object.values(prisma) as any[]) {
    m.findFirst.mockResolvedValue(null);
    m.findMany.mockResolvedValue([]);
    m.findUnique.mockResolvedValue(null);
    m.aggregate.mockResolvedValue({ _sum: { points: 0 } });
  }
  return prisma;
}

describe('Sports tenant isolation', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makePrisma();
  });

  describe('a missing institute fails closed', () => {
    it.each(['', '   ', undefined, null])('refuses %p instead of running an unfiltered query', async (bad) => {
      const svc = new SportsCoreService(prisma);
      await expect(svc.listSports(bad as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.sportsSport.findMany).not.toHaveBeenCalled();
    });
  });

  describe('core catalog', () => {
    it('stamps new rows and filters lists by institute', async () => {
      prisma.sportsSport.create.mockResolvedValue({});
      await new SportsCoreService(prisma).createSport(A, { name: 'Football' } as any);
      expect(prisma.sportsSport.create.mock.calls[0][0].data.institute_id).toBe(A);

      await new SportsCoreService(prisma).listVenues(A);
      expect(prisma.sportsVenue.findMany.mock.calls[0][0].where).toEqual({ institute_id: A });
    });

    it('cannot read, update or delete another institute\'s sport, venue, staff or participant', async () => {
      const svc = new SportsCoreService(prisma);
      await expect(svc.getSport(B, 1)).rejects.toThrow(NotFoundException);
      await expect(svc.updateSport(B, 1, {} as any)).rejects.toThrow(NotFoundException);
      await expect(svc.getVenue(B, 1)).rejects.toThrow(NotFoundException);
      await expect(svc.getStaff(B, 1)).rejects.toThrow(NotFoundException);
      await expect(svc.getParticipant(B, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsSport.update).not.toHaveBeenCalled();
      expect(prisma.sportsSport.findFirst.mock.calls[0][0].where).toEqual({ sport_id: 1, institute_id: B });
    });
  });

  describe('houses', () => {
    it('will not add another institute\'s participant to a house', async () => {
      prisma.sportsHouse.findFirst.mockResolvedValue({ house_id: 1 });
      const svc = new SportsHousesService(prisma);
      await expect(svc.addMember(A, 1, { participant_id: 9, academic_year: '2026-27' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsHouseMembership.upsert).not.toHaveBeenCalled();
    });

    it('stamps a membership and a points ledger entry with the institute', async () => {
      prisma.sportsHouse.findFirst.mockResolvedValue({ house_id: 1 });
      prisma.sportsParticipant.findFirst.mockResolvedValue({ participant_id: 9 });
      prisma.sportsHouseMembership.upsert.mockResolvedValue({});
      await new SportsHousesService(prisma).addMember(A, 1, { participant_id: 9, academic_year: '2026-27' } as any);
      expect(prisma.sportsHouseMembership.upsert.mock.calls[0][0].create.institute_id).toBe(A);

      prisma.sportsHousePoint.create.mockResolvedValue({});
      prisma.sportsHouse.findMany.mockResolvedValue([]);
      await new SportsHousesService(prisma).awardPoints(A, 1, { points: 5, source_type: 'manual', awarded_date: '2026-01-01', academic_year: '2026-27' } as any);
      expect(prisma.sportsHousePoint.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot view another institute\'s house, members or standings', async () => {
      const svc = new SportsHousesService(prisma);
      await expect(svc.getHouse(B, 1)).rejects.toThrow(NotFoundException);
      await svc.getStandings(B, '2026-27');
      expect(prisma.sportsHouseStanding.findMany.mock.calls[0][0].where).toEqual({ academic_year: '2026-27', institute_id: B });
    });
  });

  describe('tournaments, teams and fixtures', () => {
    it('will not create a tournament on another institute\'s sport', async () => {
      const svc = new SportsTournamentsService(prisma, new SportsHousesService(prisma));
      await expect(svc.createTournament(A, { sport_id: 1, name: 't', start_date: '2026-01-01', end_date: '2026-01-02' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsTournament.create).not.toHaveBeenCalled();
    });

    it('stamps the tournament, its teams and its fixtures with the institute', async () => {
      const svc = new SportsTournamentsService(prisma, new SportsHousesService(prisma));
      prisma.sportsSport.findFirst.mockResolvedValue({ sport_id: 1 });
      prisma.sportsTournament.create.mockResolvedValue({ tournament_id: 5 });
      await svc.createTournament(A, { sport_id: 1, name: 't', start_date: '2026-01-01', end_date: '2026-01-02' } as any);
      expect(prisma.sportsTournament.create.mock.calls[0][0].data.institute_id).toBe(A);

      prisma.sportsTournament.findFirst.mockResolvedValue({ tournament_id: 5 });
      prisma.sportsTournamentTeam.create.mockResolvedValue({ tournament_team_id: 8 });
      await svc.createTeam(A, 5, { team_name: 'Red' } as any);
      expect(prisma.sportsTournamentTeam.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot create a fixture between another institute\'s teams', async () => {
      const svc = new SportsTournamentsService(prisma, new SportsHousesService(prisma));
      prisma.sportsTournament.findFirst.mockResolvedValue({ tournament_id: 5 });
      await expect(svc.createFixture(B, 5, { team_a_id: 1, team_b_id: 2, round: 'final', scheduled_date: '2026-01-01' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsFixture.create).not.toHaveBeenCalled();
    });

    it('rejects a recorded winner that is not one of the fixture\'s own teams', async () => {
      const svc = new SportsTournamentsService(prisma, new SportsHousesService(prisma));
      prisma.sportsFixture.findFirst.mockResolvedValue({ fixture_id: 1, team_a_id: 10, team_b_id: 11, tournament: { name: 't' } });
      await expect(svc.recordResult(A, 1, { team_a_score: '1', team_b_score: '0', winner_team_id: 999 } as any)).rejects.toThrow(BadRequestException);
      expect(prisma.sportsFixtureResult.upsert).not.toHaveBeenCalled();
    });

    it('cannot record a stat for another institute\'s fixture or participant', async () => {
      const svc = new SportsTournamentsService(prisma, new SportsHousesService(prisma));
      await expect(svc.recordPlayerStat(B, 1, { participant_id: 1, stat_type: 'goals', stat_value: 1 } as any)).rejects.toThrow(NotFoundException);
      prisma.sportsFixture.findFirst.mockResolvedValue({ fixture_id: 1 });
      await expect(svc.recordPlayerStat(B, 1, { participant_id: 1, stat_type: 'goals', stat_value: 1 } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsPlayerMatchStat.create).not.toHaveBeenCalled();
    });
  });

  describe('records and awards', () => {
    it('will not create a record for another institute\'s sport', async () => {
      const svc = new SportsRecordsService(prisma);
      await expect(svc.createRecord(B, { sport_id: 1, record_type: 'best', description: 'd', value: '1', achieved_date: '2026-01-01' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsRecord.create).not.toHaveBeenCalled();
    });

    it('stamps records and awards with the institute', async () => {
      const svc = new SportsRecordsService(prisma);
      prisma.sportsSport.findFirst.mockResolvedValue({ sport_id: 1 });
      prisma.sportsRecord.create.mockResolvedValue({});
      await svc.createRecord(A, { sport_id: 1, record_type: 'best', description: 'd', value: '1', achieved_date: '2026-01-01' } as any);
      expect(prisma.sportsRecord.create.mock.calls[0][0].data.institute_id).toBe(A);

      prisma.sportsTournament.findFirst.mockResolvedValue({ tournament_id: 5 });
      prisma.sportsAward.create.mockResolvedValue({});
      await svc.issueAward(A, 5, { award_type: 'gold', issued_date: '2026-01-01' } as any);
      expect(prisma.sportsAward.create.mock.calls[0][0].data.institute_id).toBe(A);
    });

    it('cannot list another institute\'s participant records or tournament awards', async () => {
      const svc = new SportsRecordsService(prisma);
      await expect(svc.getParticipantRecords(B, 1)).rejects.toThrow(NotFoundException);
      await expect(svc.getTournamentAwards(B, 5)).rejects.toThrow(NotFoundException);
      expect(prisma.sportsRecord.findMany).not.toHaveBeenCalled();
    });
  });
});
