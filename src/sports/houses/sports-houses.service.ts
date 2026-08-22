import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHouseDto, UpdateHouseDto } from './dto/create-house.dto';
import { AddHouseMemberDto } from './dto/add-house-member.dto';
import { AwardHousePointsDto } from './dto/award-house-points.dto';

@Injectable()
export class SportsHousesService {
  constructor(private readonly prisma: PrismaService) {}

  async createHouse(dto: CreateHouseDto) {
    return this.prisma.sportsHouse.create({ data: dto });
  }

  async listHouses() {
    return this.prisma.sportsHouse.findMany({
      include: {
        house_master: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getHouse(id: number) {
    const house = await this.prisma.sportsHouse.findUnique({
      where: { house_id: id },
      include: { house_master: true, standings: true },
    });
    if (!house) throw new NotFoundException(`House #${id} not found`);
    return house;
  }

  async updateHouse(id: number, dto: UpdateHouseDto) {
    await this.getHouse(id);
    return this.prisma.sportsHouse.update({ where: { house_id: id }, data: dto });
  }

  async deleteHouse(id: number) {
    await this.getHouse(id);
    return this.prisma.sportsHouse.delete({ where: { house_id: id } });
  }

  // ─── House Memberships ─────────────────────────────────────────────────────

  async addMember(houseId: number, dto: AddHouseMemberDto) {
    await this.getHouse(houseId);

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
        house_id: houseId,
        participant_id: dto.participant_id,
        academic_year: dto.academic_year,
        status: dto.status ?? 'active',
      },
      include: { participant: true, house: true },
    });
  }

  async getMembers(houseId: number, academic_year?: string) {
    await this.getHouse(houseId);
    return this.prisma.sportsHouseMembership.findMany({
      where: {
        house_id: houseId,
        ...(academic_year && { academic_year }),
      },
      include: { participant: true },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Points Ledger & Standings ─────────────────────────────────────────────

  async awardPoints(houseId: number, dto: AwardHousePointsDto, userId?: number) {
    await this.getHouse(houseId);

    const pointRecord = await this.prisma.sportsHousePoint.create({
      data: {
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
    await this.recalculateStandings(dto.academic_year);

    return pointRecord;
  }

  async getPointsHistory(houseId: number) {
    await this.getHouse(houseId);
    return this.prisma.sportsHousePoint.findMany({
      where: { house_id: houseId },
      include: { awarder_user: true },
      orderBy: { awarded_date: 'desc' },
    });
  }

  async getStandings(academic_year: string = '2026-27') {
    await this.recalculateStandings(academic_year);

    return this.prisma.sportsHouseStanding.findMany({
      where: { academic_year },
      include: { house: true },
      orderBy: { total_points: 'desc' },
    });
  }

  private async recalculateStandings(academic_year: string) {
    const houses = await this.prisma.sportsHouse.findMany();

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
          house_id: item.house_id,
          academic_year,
          total_points: item.total,
          rank: i + 1,
        },
      });
    }
  }
}
