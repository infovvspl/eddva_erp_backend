import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateTournamentDto, UpdateTournamentDto } from './dto/create-tournament.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateFixtureDto } from './dto/create-fixture.dto';
import { RecordResultDto } from './dto/record-result.dto';
import { RecordPlayerStatDto } from './dto/record-player-stat.dto';
import { SportsHousesService } from '../houses/sports-houses.service';

@Injectable()
export class SportsTournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly housesService: SportsHousesService,
  ) {}

  // ─── Tournaments CRUD ──────────────────────────────────────────────────────

  async createTournament(instituteId: string, dto: CreateTournamentDto, userId?: number) {
    const institute_id = requireInstituteId(instituteId);

    // The sport and (if given) the venue must belong to the same institute.
    const sport = await this.prisma.sportsSport.findFirst({ where: { sport_id: dto.sport_id, institute_id } });
    if (!sport) throw new NotFoundException(`Sport #${dto.sport_id} not found`);
    if (dto.venue_id) {
      const venue = await this.prisma.sportsVenue.findFirst({ where: { venue_id: dto.venue_id, institute_id } });
      if (!venue) throw new NotFoundException(`Venue #${dto.venue_id} not found`);
    }

    return this.prisma.sportsTournament.create({
      data: {
        institute_id,
        name: dto.name,
        sport_id: dto.sport_id,
        level: dto.level ?? 'inter_house',
        format: dto.format ?? 'knockout',
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        venue_id: dto.venue_id,
        status: dto.status ?? 'upcoming',
        created_by: userId ?? null,
      },
      include: { sport: true, venue: true },
    });
  }

  async listTournaments(instituteId: string) {
    return this.prisma.sportsTournament.findMany({
      where: { institute_id: requireInstituteId(instituteId) },
      include: {
        sport: true,
        venue: true,
        _count: { select: { teams: true, fixtures: true } },
      },
      orderBy: { start_date: 'desc' },
    });
  }

  async getTournament(instituteId: string, id: number) {
    const item = await this.prisma.sportsTournament.findFirst({
      where: { tournament_id: id, institute_id: requireInstituteId(instituteId) },
      include: {
        sport: true,
        venue: true,
        teams: { include: { house: true, coach: true, members: { include: { participant: true } } } },
        fixtures: { include: { team_a: true, team_b: true, venue: true, result: true } },
      },
    });
    if (!item) throw new NotFoundException(`Tournament #${id} not found`);
    return item;
  }

  async updateTournament(instituteId: string, id: number, dto: UpdateTournamentDto) {
    await this.getTournament(instituteId, id);
    if (dto.sport_id) {
      const sport = await this.prisma.sportsSport.findFirst({ where: { sport_id: dto.sport_id, institute_id: instituteId } });
      if (!sport) throw new NotFoundException(`Sport #${dto.sport_id} not found`);
    }
    if (dto.venue_id !== undefined && dto.venue_id !== null) {
      const venue = await this.prisma.sportsVenue.findFirst({ where: { venue_id: dto.venue_id, institute_id: instituteId } });
      if (!venue) throw new NotFoundException(`Venue #${dto.venue_id} not found`);
    }
    return this.prisma.sportsTournament.update({
      where: { tournament_id: id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.sport_id && { sport_id: dto.sport_id }),
        ...(dto.level && { level: dto.level }),
        ...(dto.format && { format: dto.format }),
        ...(dto.start_date && { start_date: new Date(dto.start_date) }),
        ...(dto.end_date && { end_date: new Date(dto.end_date) }),
        ...(dto.venue_id !== undefined && { venue_id: dto.venue_id }),
        ...(dto.status && { status: dto.status }),
      },
      include: { sport: true, venue: true },
    });
  }

  // ─── Teams Management ──────────────────────────────────────────────────────

  async createTeam(instituteId: string, tournamentId: number, dto: CreateTeamDto) {
    const institute_id = requireInstituteId(instituteId);
    await this.getTournament(institute_id, tournamentId);

    const team = await this.prisma.sportsTournamentTeam.create({
      data: {
        institute_id,
        tournament_id: tournamentId,
        team_name: dto.team_name,
        house_id: dto.house_id,
        coach_id: dto.coach_id,
      },
    });

    if (dto.members && dto.members.length > 0) {
      for (const m of dto.members) {
        await this.prisma.sportsTournamentTeamMember.create({
          data: {
            institute_id,
            tournament_team_id: team.tournament_team_id,
            participant_id: m.participant_id,
            role: m.role ?? 'player',
          },
        });
      }
    }

    return this.prisma.sportsTournamentTeam.findUnique({
      where: { tournament_team_id: team.tournament_team_id },
      include: { house: true, coach: true, members: { include: { participant: true } } },
    });
  }

  async getTeams(instituteId: string, tournamentId: number) {
    await this.getTournament(instituteId, tournamentId);
    return this.prisma.sportsTournamentTeam.findMany({
      where: { tournament_id: tournamentId, institute_id: instituteId },
      include: { house: true, coach: true, members: { include: { participant: true } } },
      orderBy: { team_name: 'asc' },
    });
  }

  // ─── Fixtures Management ───────────────────────────────────────────────────

  async createFixture(instituteId: string, tournamentId: number, dto: CreateFixtureDto) {
    const institute_id = requireInstituteId(instituteId);
    await this.getTournament(institute_id, tournamentId);

    if (dto.team_a_id === dto.team_b_id) {
      throw new BadRequestException('Team A and Team B cannot be the same team');
    }

    const teamA = await this.prisma.sportsTournamentTeam.findFirst({
      where: { tournament_team_id: dto.team_a_id, tournament_id: tournamentId, institute_id },
    });
    if (!teamA) {
      throw new NotFoundException(`Team A #${dto.team_a_id} not found in Tournament #${tournamentId}`);
    }

    const teamB = await this.prisma.sportsTournamentTeam.findFirst({
      where: { tournament_team_id: dto.team_b_id, tournament_id: tournamentId, institute_id },
    });
    if (!teamB) {
      throw new NotFoundException(`Team B #${dto.team_b_id} not found in Tournament #${tournamentId}`);
    }

    return this.prisma.sportsFixture.create({
      data: {
        institute_id,
        tournament_id: tournamentId,
        round: dto.round,
        team_a_id: dto.team_a_id,
        team_b_id: dto.team_b_id,
        venue_id: dto.venue_id,
        scheduled_date: new Date(dto.scheduled_date),
        status: dto.status ?? 'scheduled',
      },
      include: { team_a: true, team_b: true, venue: true },
    });
  }

  async getFixtures(instituteId: string, tournamentId: number) {
    await this.getTournament(instituteId, tournamentId);
    return this.prisma.sportsFixture.findMany({
      where: { tournament_id: tournamentId, institute_id: instituteId },
      include: {
        team_a: true,
        team_b: true,
        venue: true,
        result: { include: { winner_team: true } },
      },
      orderBy: { scheduled_date: 'asc' },
    });
  }

  // ─── Result Recording & Scoring ───────────────────────────────────────────

  async recordResult(instituteId: string, fixtureId: number, dto: RecordResultDto, userId?: number) {
    const institute_id = requireInstituteId(instituteId);
    const fixture = await this.prisma.sportsFixture.findFirst({
      where: { fixture_id: fixtureId, institute_id },
      include: { tournament: true },
    });
    if (!fixture) throw new NotFoundException(`Fixture #${fixtureId} not found`);

    if (dto.winner_team_id) {
      const winnerBelongsToFixture = [fixture.team_a_id, fixture.team_b_id].includes(dto.winner_team_id);
      if (!winnerBelongsToFixture) {
        throw new BadRequestException(`Team #${dto.winner_team_id} is not one of this fixture's teams`);
      }
    }

    const result = await this.prisma.sportsFixtureResult.upsert({
      where: { fixture_id: fixtureId },
      update: {
        team_a_score: dto.team_a_score,
        team_b_score: dto.team_b_score,
        winner_team_id: dto.winner_team_id ?? null,
        result_notes: dto.result_notes,
        recorded_by: userId ?? null,
      },
      create: {
        institute_id,
        fixture_id: fixtureId,
        team_a_score: dto.team_a_score,
        team_b_score: dto.team_b_score,
        winner_team_id: dto.winner_team_id ?? null,
        result_notes: dto.result_notes,
        recorded_by: userId ?? null,
      },
      include: { winner_team: true },
    });

    // Mark fixture status as completed
    await this.prisma.sportsFixture.update({
      where: { fixture_id: fixtureId },
      data: { status: 'completed' },
    });

    // Auto-award house points if winner is linked to a House and points specified
    if (dto.winner_team_id && dto.house_points_award && dto.house_points_award > 0) {
      const winnerTeam = await this.prisma.sportsTournamentTeam.findFirst({
        where: { tournament_team_id: dto.winner_team_id, institute_id },
      });

      if (winnerTeam && winnerTeam.house_id) {
        await this.housesService.awardPoints(
          institute_id,
          winnerTeam.house_id,
          {
            points: dto.house_points_award,
            source_type: 'tournament_result',
            source_reference_id: fixtureId,
            reason: `Winner in ${fixture.tournament.name} (${fixture.round})`,
            awarded_date: new Date().toISOString().split('T')[0],
            academic_year: dto.academic_year ?? '2026-27',
          },
          userId,
        );
      }
    }

    return result;
  }

  async recordPlayerStat(instituteId: string, fixtureId: number, dto: RecordPlayerStatDto) {
    const institute_id = requireInstituteId(instituteId);
    const fixture = await this.prisma.sportsFixture.findFirst({ where: { fixture_id: fixtureId, institute_id } });
    if (!fixture) throw new NotFoundException(`Fixture #${fixtureId} not found`);

    const participant = await this.prisma.sportsParticipant.findFirst({
      where: { participant_id: dto.participant_id, institute_id },
    });
    if (!participant) throw new NotFoundException(`Participant #${dto.participant_id} not found`);

    return this.prisma.sportsPlayerMatchStat.create({
      data: {
        institute_id,
        fixture_id: fixtureId,
        participant_id: dto.participant_id,
        stat_type: dto.stat_type,
        stat_value: dto.stat_value,
      },
      include: { participant: true },
    });
  }
}
