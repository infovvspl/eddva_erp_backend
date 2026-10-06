import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CreateSportDto, UpdateSportDto } from './dto/create-sport.dto';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/create-staff.dto';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/create-participant.dto';

@Injectable()
export class SportsCoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sports Catalog ────────────────────────────────────────────────────────
  async createSport(instituteId: string, dto: CreateSportDto) {
    return this.prisma.sportsSport.create({ data: { ...dto, institute_id: requireInstituteId(instituteId) } });
  }

  async listSports(instituteId: string) {
    return this.prisma.sportsSport.findMany({ where: { institute_id: requireInstituteId(instituteId) }, orderBy: { name: 'asc' } });
  }

  async getSport(instituteId: string, id: number) {
    const item = await this.prisma.sportsSport.findFirst({ where: { sport_id: id, institute_id: requireInstituteId(instituteId) } });
    if (!item) throw new NotFoundException(`Sport #${id} not found`);
    return item;
  }

  async updateSport(instituteId: string, id: number, dto: UpdateSportDto) {
    await this.getSport(instituteId, id);
    return this.prisma.sportsSport.update({ where: { sport_id: id }, data: dto });
  }

  async deleteSport(instituteId: string, id: number) {
    await this.getSport(instituteId, id);
    return this.prisma.sportsSport.delete({ where: { sport_id: id } });
  }

  // ─── Venues ────────────────────────────────────────────────────────────────
  async createVenue(instituteId: string, dto: CreateVenueDto) {
    return this.prisma.sportsVenue.create({ data: { ...dto, institute_id: requireInstituteId(instituteId) } });
  }

  async listVenues(instituteId: string) {
    return this.prisma.sportsVenue.findMany({ where: { institute_id: requireInstituteId(instituteId) }, orderBy: { name: 'asc' } });
  }

  async getVenue(instituteId: string, id: number) {
    const venue = await this.prisma.sportsVenue.findFirst({ where: { venue_id: id, institute_id: requireInstituteId(instituteId) } });
    if (!venue) throw new NotFoundException(`Venue #${id} not found`);
    return venue;
  }

  async updateVenue(instituteId: string, id: number, dto: UpdateVenueDto) {
    await this.getVenue(instituteId, id);
    return this.prisma.sportsVenue.update({ where: { venue_id: id }, data: dto });
  }

  async deleteVenue(instituteId: string, id: number) {
    await this.getVenue(instituteId, id);
    return this.prisma.sportsVenue.delete({ where: { venue_id: id } });
  }

  // ─── Staff ─────────────────────────────────────────────────────────────────
  async createStaff(instituteId: string, dto: CreateStaffDto) {
    return this.prisma.sportsStaff.create({ data: { ...dto, institute_id: requireInstituteId(instituteId) } });
  }

  async listStaff(instituteId: string) {
    return this.prisma.sportsStaff.findMany({ where: { institute_id: requireInstituteId(instituteId) }, orderBy: { name: 'asc' } });
  }

  async getStaff(instituteId: string, id: number) {
    const staff = await this.prisma.sportsStaff.findFirst({ where: { staff_id: id, institute_id: requireInstituteId(instituteId) } });
    if (!staff) throw new NotFoundException(`Staff #${id} not found`);
    return staff;
  }

  async updateStaff(instituteId: string, id: number, dto: UpdateStaffDto) {
    await this.getStaff(instituteId, id);
    return this.prisma.sportsStaff.update({ where: { staff_id: id }, data: dto });
  }

  async deleteStaff(instituteId: string, id: number) {
    await this.getStaff(instituteId, id);
    return this.prisma.sportsStaff.delete({ where: { staff_id: id } });
  }

  // ─── Participants ──────────────────────────────────────────────────────────
  async createParticipant(instituteId: string, dto: CreateParticipantDto) {
    return this.prisma.sportsParticipant.create({ data: { ...dto, institute_id: requireInstituteId(instituteId) } });
  }

  async listParticipants(instituteId: string) {
    return this.prisma.sportsParticipant.findMany({ where: { institute_id: requireInstituteId(instituteId) }, orderBy: { name: 'asc' } });
  }

  async getParticipant(instituteId: string, id: number) {
    const participant = await this.prisma.sportsParticipant.findFirst({
      where: { participant_id: id, institute_id: requireInstituteId(instituteId) },
      include: {
        house_memberships: { include: { house: true } },
      },
    });
    if (!participant) throw new NotFoundException(`Participant #${id} not found`);
    return participant;
  }

  async updateParticipant(instituteId: string, id: number, dto: UpdateParticipantDto) {
    await this.getParticipant(instituteId, id);
    return this.prisma.sportsParticipant.update({ where: { participant_id: id }, data: dto });
  }

  async deleteParticipant(instituteId: string, id: number) {
    await this.getParticipant(instituteId, id);
    return this.prisma.sportsParticipant.delete({ where: { participant_id: id } });
  }
}
