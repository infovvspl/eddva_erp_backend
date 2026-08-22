import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSportDto, UpdateSportDto } from './dto/create-sport.dto';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/create-staff.dto';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/create-participant.dto';

@Injectable()
export class SportsCoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sports Catalog ────────────────────────────────────────────────────────
  async createSport(dto: CreateSportDto) {
    return this.prisma.sportsSport.create({ data: dto });
  }

  async listSports() {
    return this.prisma.sportsSport.findMany({ orderBy: { name: 'asc' } });
  }

  async getSport(id: number) {
    const item = await this.prisma.sportsSport.findUnique({ where: { sport_id: id } });
    if (!item) throw new NotFoundException(`Sport #${id} not found`);
    return item;
  }

  async updateSport(id: number, dto: UpdateSportDto) {
    await this.getSport(id);
    return this.prisma.sportsSport.update({ where: { sport_id: id }, data: dto });
  }

  async deleteSport(id: number) {
    await this.getSport(id);
    return this.prisma.sportsSport.delete({ where: { sport_id: id } });
  }

  // ─── Venues ────────────────────────────────────────────────────────────────
  async createVenue(dto: CreateVenueDto) {
    return this.prisma.sportsVenue.create({ data: dto });
  }

  async listVenues() {
    return this.prisma.sportsVenue.findMany({ orderBy: { name: 'asc' } });
  }

  async getVenue(id: number) {
    const venue = await this.prisma.sportsVenue.findUnique({ where: { venue_id: id } });
    if (!venue) throw new NotFoundException(`Venue #${id} not found`);
    return venue;
  }

  async updateVenue(id: number, dto: UpdateVenueDto) {
    await this.getVenue(id);
    return this.prisma.sportsVenue.update({ where: { venue_id: id }, data: dto });
  }

  async deleteVenue(id: number) {
    await this.getVenue(id);
    return this.prisma.sportsVenue.delete({ where: { venue_id: id } });
  }

  // ─── Staff ─────────────────────────────────────────────────────────────────
  async createStaff(dto: CreateStaffDto) {
    return this.prisma.sportsStaff.create({ data: dto });
  }

  async listStaff() {
    return this.prisma.sportsStaff.findMany({ orderBy: { name: 'asc' } });
  }

  async getStaff(id: number) {
    const staff = await this.prisma.sportsStaff.findUnique({ where: { staff_id: id } });
    if (!staff) throw new NotFoundException(`Staff #${id} not found`);
    return staff;
  }

  async updateStaff(id: number, dto: UpdateStaffDto) {
    await this.getStaff(id);
    return this.prisma.sportsStaff.update({ where: { staff_id: id }, data: dto });
  }

  async deleteStaff(id: number) {
    await this.getStaff(id);
    return this.prisma.sportsStaff.delete({ where: { staff_id: id } });
  }

  // ─── Participants ──────────────────────────────────────────────────────────
  async createParticipant(dto: CreateParticipantDto) {
    return this.prisma.sportsParticipant.create({ data: dto });
  }

  async listParticipants() {
    return this.prisma.sportsParticipant.findMany({ orderBy: { name: 'asc' } });
  }

  async getParticipant(id: number) {
    const participant = await this.prisma.sportsParticipant.findUnique({
      where: { participant_id: id },
      include: {
        house_memberships: { include: { house: true } },
      },
    });
    if (!participant) throw new NotFoundException(`Participant #${id} not found`);
    return participant;
  }

  async updateParticipant(id: number, dto: UpdateParticipantDto) {
    await this.getParticipant(id);
    return this.prisma.sportsParticipant.update({ where: { participant_id: id }, data: dto });
  }

  async deleteParticipant(id: number) {
    await this.getParticipant(id);
    return this.prisma.sportsParticipant.delete({ where: { participant_id: id } });
  }
}
