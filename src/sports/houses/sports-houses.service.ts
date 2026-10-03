import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateHouseDto, UpdateHouseDto } from './dto/create-house.dto';
import { AddHouseMemberDto } from './dto/add-house-member.dto';
import { AwardHousePointsDto } from './dto/award-house-points.dto';

@Injectable()
export class SportsHousesService {
  constructor(private readonly prisma: PrismaService) {}

  async createHouse(instituteId: string, dto: CreateHouseDto) {
    return this.prisma.sportsHouse.create({ data: { ...dto, institute_id: requireInstituteId(instituteId) } });
  }

  async listHouses(instituteId: string) {
    return this.prisma.sportsHouse.findMany({
      where: { institute_id: requireInstituteId(instituteId) },
      include: {
        house_master: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getHouse(instituteId: string, id: number) {
    const house = await this.prisma.sportsHouse.findFirst({
      where: { house_id: id, institute_id: requireInstituteId(instituteId) },
      include: { house_master: true, standings: true },
    });
    if (!house) throw new NotFoundException(`House #${id} not found`);
    return house;
  }

  async updateHouse(instituteId: string, id: number, dto: UpdateHouseDto) {
    await this.getHouse(instituteId, id);
    return this.prisma.sportsHouse.update({ where: { house_id: id }, data: dto });
  }

  async deleteHouse(instituteId: string, id: number) {
    await this.getHouse(instituteId, id);
    return this.prisma.sportsHouse.delete({ where: { house_id: id } });
  }

  // ─── House Memberships ─────────────────────────────────────────────────────

  async addMember(instituteId: string, houseId: number, dto: AddHouseMemberDto) {
    const institute_id = requireInstituteId(instituteId);
    await this.getHouse(institute_id, houseId);

    // The participant must belong to the same institute as the house being joined.
    const participant = await this.prisma.sportsParticipant.findFirst({
      where: { participant_id: dto.participant_id, institute_id },
    });
    if (!participant) throw new NotFoundException(`Participant #${dto.participant_id} not found`);

    return this.prisma.sportsHouseMembership.upsert({
      where: {
        participant_id_academic_year: {
          participant_id: dto.participant_id,
          academic_year: dto.academic_year,
        },
      },
      update: {
        house_id: houseId,
        status: dto.status ?? 'active',
      },
      create: {
        institute_id,
        house_id: houseId,
        participant_id: dto.participant_id,
        academic_year: dto.academic_year,
        status: dto.status ?? 'active',
      },
      include: { participant: true, house: true },
    });
  }

  async getMembers(instituteId: string, houseId: number, academic_year?: string) {
    await this.getHouse(instituteId, houseId);
    return this.prisma.sportsHouseMembership.findMany({
      where: {
        house_id: houseId,
        institute_id: instituteId,
        ...(academic_year && { academic_year }),
      },
      include: { participant: true },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Points Ledger & Standings ─────────────────────────────────────────────

  async awardPoints(instituteId: string, houseId: number, dto: AwardHousePointsDto, userId?: number) {
    const institute_id = requireInstituteId(instituteId);
    await this.getHouse(institute_id, houseId);

    const pointRecord = await this.prisma.sportsHousePoint.create({
      data: {
        institute_id,
        house_id: houseId,
        points: dto.points,
        source_type: dto.source_type,
        source_reference_id: dto.source_reference_id,
        reason: dto.reason,
        awarded_date: new Date(dto.awarded_date),
        awarded_by: userId ?? null,
      },
    });

    // Recompute standings for this academic year
    await this.recalculateStandings(institute_id, dto.academic_year);

    return pointRecord;
  }

  async getPointsHistory(instituteId: string, houseId: number) {
    await this.getHouse(instituteId, houseId);
    return this.prisma.sportsHousePoint.findMany({
      where: { house_id: houseId, institute_id: instituteId },
      include: { awarder_user: true },
      orderBy: { awarded_date: 'desc' },
    });
  }

  async getStandings(instituteId: string, academic_year: string = '2026-27') {
    const institute_id = requireInstituteId(instituteId);
    await this.recalculateStandings(institute_id, academic_year);

    return this.prisma.sportsHouseStanding.findMany({
      where: { academic_year, institute_id },
      include: { house: true },
      orderBy: { total_points: 'desc' },
    });
  }

  private async recalculateStandings(instituteId: string, academic_year: string) {
    const houses = await this.prisma.sportsHouse.findMany({ where: { institute_id: instituteId } });

    const standingsMap: { house_id: number; total: number }[] = [];

    for (const house of houses) {
      const aggregate = await this.prisma.sportsHousePoint.aggregate({
        where: { house_id: house.house_id },
        _sum: { points: true },
      });
      const total = aggregate._sum.points ?? 0;
      standingsMap.push({ house_id: house.house_id, total });
    }

    // Sort descending by points to calculate rank
    standingsMap.sort((a, b) => b.total - a.total);

    for (let i = 0; i < standingsMap.length; i++) {
      const item = standingsMap[i];
      await this.prisma.sportsHouseStanding.upsert({
        where: {
          house_id_academic_year: {
            house_id: item.house_id,
            academic_year,
          },
        },
        update: {
          total_points: item.total,
          rank: i + 1,
        },
        create: {
          institute_id: instituteId,
          house_id: item.house_id,
          academic_year,
          total_points: item.total,
          rank: i + 1,
        },
      });
    }
  }
}
