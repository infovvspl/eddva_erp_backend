import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSportsRecordDto } from './dto/create-record.dto';
import { IssueAwardDto } from './dto/issue-award.dto';

@Injectable()
export class SportsRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sports Records ────────────────────────────────────────────────────────

  async createRecord(dto: CreateSportsRecordDto, userId?: number) {
    return this.prisma.sportsRecord.create({
      data: {
        participant_id: dto.participant_id ?? null,
        tournament_team_id: dto.tournament_team_id ?? null,
        sport_id: dto.sport_id,
        record_type: dto.record_type,
        description: dto.description,
        value: dto.value,
        achieved_date: new Date(dto.achieved_date),
        source_fixture_id: dto.source_fixture_id ?? null,
        verified_by: userId ?? null,
      },
      include: { participant: true, sport: true, verifier: true },
    });
  }

  async getParticipantRecords(participantId: number) {
    const participant = await this.prisma.sportsParticipant.findUnique({
      where: { participant_id: participantId },
    });
    if (!participant) throw new NotFoundException(`Participant #${participantId} not found`);

    return this.prisma.sportsRecord.findMany({
      where: { participant_id: participantId },
      include: { sport: true, source_fixture: true, verifier: true },
      orderBy: { achieved_date: 'desc' },
    });
  }

  async getSportRecords(sportId: number) {
    const sport = await this.prisma.sportsSport.findUnique({ where: { sport_id: sportId } });
    if (!sport) throw new NotFoundException(`Sport #${sportId} not found`);

    return this.prisma.sportsRecord.findMany({
      where: { sport_id: sportId },
      include: { participant: true, tournament_team: true, verifier: true },
      orderBy: { achieved_date: 'desc' },
    });
  }

  // ─── Awards ────────────────────────────────────────────────────────────────

  async issueAward(tournamentId: number, dto: IssueAwardDto) {
    const tournament = await this.prisma.sportsTournament.findUnique({ where: { tournament_id: tournamentId } });
    if (!tournament) throw new NotFoundException(`Tournament #${tournamentId} not found`);

    return this.prisma.sportsAward.create({
      data: {
        tournament_id: tournamentId,
        participant_id: dto.participant_id ?? null,
        tournament_team_id: dto.tournament_team_id ?? null,
        award_type: dto.award_type,
        issued_date: new Date(dto.issued_date),
      },
      include: { participant: true, tournament_team: true, tournament: true },
    });
  }

  async getTournamentAwards(tournamentId: number) {
    const tournament = await this.prisma.sportsTournament.findUnique({ where: { tournament_id: tournamentId } });
    if (!tournament) throw new NotFoundException(`Tournament #${tournamentId} not found`);

    return this.prisma.sportsAward.findMany({
      where: { tournament_id: tournamentId },
      include: { participant: true, tournament_team: true },
      orderBy: { issued_date: 'desc' },
    });
  }
}
