import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateSportsRecordDto } from './dto/create-record.dto';
import { IssueAwardDto } from './dto/issue-award.dto';

@Injectable()
export class SportsRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sports Records ────────────────────────────────────────────────────────

  async createRecord(instituteId: string, dto: CreateSportsRecordDto, userId?: number) {
    const institute_id = requireInstituteId(instituteId);
    const sport = await this.prisma.sportsSport.findFirst({ where: { sport_id: dto.sport_id, institute_id } });
    if (!sport) throw new NotFoundException(`Sport #${dto.sport_id} not found`);

    return this.prisma.sportsRecord.create({
      data: {
        institute_id,
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

  async getParticipantRecords(instituteId: string, participantId: number) {
    const institute_id = requireInstituteId(instituteId);
    const participant = await this.prisma.sportsParticipant.findFirst({
      where: { participant_id: participantId, institute_id },
    });
    if (!participant) throw new NotFoundException(`Participant #${participantId} not found`);

    return this.prisma.sportsRecord.findMany({
      where: { participant_id: participantId, institute_id },
      include: { sport: true, source_fixture: true, verifier: true },
      orderBy: { achieved_date: 'desc' },
    });
  }

  async getSportRecords(instituteId: string, sportId: number) {
    const institute_id = requireInstituteId(instituteId);
    const sport = await this.prisma.sportsSport.findFirst({ where: { sport_id: sportId, institute_id } });
    if (!sport) throw new NotFoundException(`Sport #${sportId} not found`);

    return this.prisma.sportsRecord.findMany({
      where: { sport_id: sportId, institute_id },
      include: { participant: true, tournament_team: true, verifier: true },
      orderBy: { achieved_date: 'desc' },
    });
  }

  // ─── Awards ────────────────────────────────────────────────────────────────

  async issueAward(instituteId: string, tournamentId: number, dto: IssueAwardDto) {
    const institute_id = requireInstituteId(instituteId);
    const tournament = await this.prisma.sportsTournament.findFirst({ where: { tournament_id: tournamentId, institute_id } });
    if (!tournament) throw new NotFoundException(`Tournament #${tournamentId} not found`);

    return this.prisma.sportsAward.create({
      data: {
        institute_id,
        tournament_id: tournamentId,
        participant_id: dto.participant_id ?? null,
        tournament_team_id: dto.tournament_team_id ?? null,
        award_type: dto.award_type,
        issued_date: new Date(dto.issued_date),
      },
      include: { participant: true, tournament_team: true, tournament: true },
    });
  }

  async getTournamentAwards(instituteId: string, tournamentId: number) {
    const institute_id = requireInstituteId(instituteId);
    const tournament = await this.prisma.sportsTournament.findFirst({ where: { tournament_id: tournamentId, institute_id } });
    if (!tournament) throw new NotFoundException(`Tournament #${tournamentId} not found`);

    return this.prisma.sportsAward.findMany({
      where: { tournament_id: tournamentId, institute_id },
      include: { participant: true, tournament_team: true },
      orderBy: { issued_date: 'desc' },
    });
  }
}
