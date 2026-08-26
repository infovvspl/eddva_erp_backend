import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SportsCoreService } from './sports-core.service';
import { CreateSportDto, UpdateSportDto } from './dto/create-sport.dto';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/create-staff.dto';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/create-participant.dto';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from '../auth/sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from '../auth/sports-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

@ApiTags('Sports / Shared Core Catalog')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('api/sports')
export class SportsCoreController {
  constructor(private readonly svc: SportsCoreService) {}

  // ─── Sports Catalog ────────────────────────────────────────────────────────
  @Post('catalog')
  @RequirePermission({ resource: 'sports', action: 'create' })
  @ApiOperation({ summary: 'Add a new sport to catalog (e.g. Football, Athletics, Chess)' })
  createSport(@Body() dto: CreateSportDto) {
    return this.svc.createSport(dto);
  }

  @Get('catalog')
  @RequirePermission({ resource: 'sports', action: 'read' })
  @ApiOperation({ summary: 'List all sports in catalog' })
  listSports() {
    return this.svc.listSports();
  }

  @Get('catalog/:id')
  @RequirePermission({ resource: 'sports', action: 'read' })
  @ApiOperation({ summary: 'Get sport details' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport (e.g. 1)' })
  getSport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getSport(id);
  }

  @Patch('catalog/:id')
  @RequirePermission({ resource: 'sports', action: 'update' })
  @ApiOperation({ summary: 'Update sport entry' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport to update' })
  updateSport(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSportDto) {
    return this.svc.updateSport(id, dto);
  }

  @Delete('catalog/:id')
  @RequirePermission({ resource: 'sports', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete sport entry' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport to delete' })
  deleteSport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteSport(id);
  }

  // ─── Venues ────────────────────────────────────────────────────────────────
  @Post('venues')
  @RequirePermission({ resource: 'venues', action: 'create' })
  @ApiOperation({ summary: 'Create a venue (ground, court, pool, hall)' })
  createVenue(@Body() dto: CreateVenueDto) {
    return this.svc.createVenue(dto);
  }

  @Get('venues')
  @RequirePermission({ resource: 'venues', action: 'read' })
  @ApiOperation({ summary: 'List all venues' })
  listVenues() {
    return this.svc.listVenues();
  }

  @Get('venues/:id')
  @RequirePermission({ resource: 'venues', action: 'read' })
  @ApiOperation({ summary: 'Get venue details' })
  @ApiParam({ name: 'id', description: 'venue_id of the Venue (e.g. 1)' })
  getVenue(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getVenue(id);
  }

  @Patch('venues/:id')
  @RequirePermission({ resource: 'venues', action: 'update' })
  @ApiOperation({ summary: 'Update venue details' })
  @ApiParam({ name: 'id', description: 'venue_id of the Venue to update' })
  updateVenue(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVenueDto) {
    return this.svc.updateVenue(id, dto);
  }

  @Delete('venues/:id')
  @RequirePermission({ resource: 'venues', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete venue' })
  @ApiParam({ name: 'id', description: 'venue_id of the Venue to delete' })
  deleteVenue(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteVenue(id);
  }

  // ─── Staff ─────────────────────────────────────────────────────────────────
  @Post('staff')
  @RequirePermission({ resource: 'staff', action: 'create' })
  @ApiOperation({ summary: 'Register sports staff (coach, house_master, official)' })
  createStaff(@Body() dto: CreateStaffDto) {
    return this.svc.createStaff(dto);
  }

  @Get('staff')
  @RequirePermission({ resource: 'staff', action: 'read' })
  @ApiOperation({ summary: 'List all sports staff' })
  listStaff() {
    return this.svc.listStaff();
  }

  @Get('staff/:id')
  @RequirePermission({ resource: 'staff', action: 'read' })
  @ApiOperation({ summary: 'Get staff member details' })
  @ApiParam({ name: 'id', description: 'staff_id of the Staff Member (e.g. 1)' })
  getStaff(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getStaff(id);
  }

  @Patch('staff/:id')
  @RequirePermission({ resource: 'staff', action: 'update' })
  @ApiOperation({ summary: 'Update staff member' })
  @ApiParam({ name: 'id', description: 'staff_id of the Staff Member to update' })
  updateStaff(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffDto) {
    return this.svc.updateStaff(id, dto);
  }

  @Delete('staff/:id')
  @RequirePermission({ resource: 'staff', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete staff member' })
  @ApiParam({ name: 'id', description: 'staff_id of the Staff Member to delete' })
  deleteStaff(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteStaff(id);
  }

  // ─── Participants ──────────────────────────────────────────────────────────
  @Post('participants')
  @RequirePermission({ resource: 'participants', action: 'create' })
  @ApiOperation({ summary: 'Register student sports participant' })
  createParticipant(@Body() dto: CreateParticipantDto) {
    return this.svc.createParticipant(dto);
  }

  @Get('participants')
  @RequirePermission({ resource: 'participants', action: 'read' })
  @ApiOperation({ summary: 'List all student sports participants' })
  listParticipants() {
    return this.svc.listParticipants();
  }

  @Get('participants/:id')
  @RequirePermission({ resource: 'participants', action: 'read' })
  @ApiOperation({ summary: 'Get student participant details and house membership' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant (e.g. 1)' })
  getParticipant(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getParticipant(id);
  }

  @Patch('participants/:id')
  @RequirePermission({ resource: 'participants', action: 'update' })
  @ApiOperation({ summary: 'Update student participant info' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant to update' })
  updateParticipant(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateParticipantDto) {
    return this.svc.updateParticipant(id, dto);
  }

  @Delete('participants/:id')
  @RequirePermission({ resource: 'participants', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete student participant' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant to delete' })
  deleteParticipant(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteParticipant(id);
  }
}
