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
import { SportsUser } from '../auth/sports-user.decorator';
import type { SportsPlatformUser } from '../auth/sports-auth.service';

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
  createSport(@SportsUser() user: SportsPlatformUser, @Body() dto: CreateSportDto) {
    return this.svc.createSport(user.institute_id, dto);
  }

  @Get('catalog')
  @RequirePermission({ resource: 'sports', action: 'read' })
  @ApiOperation({ summary: 'List all sports in catalog' })
  listSports(@SportsUser() user: SportsPlatformUser) {
    return this.svc.listSports(user.institute_id);
  }

  @Get('catalog/:id')
  @RequirePermission({ resource: 'sports', action: 'read' })
  @ApiOperation({ summary: 'Get sport details' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport (e.g. 1)' })
  getSport(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getSport(user.institute_id, id);
  }

  @Patch('catalog/:id')
  @RequirePermission({ resource: 'sports', action: 'update' })
  @ApiOperation({ summary: 'Update sport entry' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport to update' })
  updateSport(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSportDto) {
    return this.svc.updateSport(user.institute_id, id, dto);
  }

  @Delete('catalog/:id')
  @RequirePermission({ resource: 'sports', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete sport entry' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport to delete' })
  deleteSport(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteSport(user.institute_id, id);
  }

  // ─── Venues ────────────────────────────────────────────────────────────────
  @Post('venues')
  @RequirePermission({ resource: 'venues', action: 'create' })
  @ApiOperation({ summary: 'Create a venue (ground, court, pool, hall)' })
  createVenue(@SportsUser() user: SportsPlatformUser, @Body() dto: CreateVenueDto) {
    return this.svc.createVenue(user.institute_id, dto);
  }

  @Get('venues')
  @RequirePermission({ resource: 'venues', action: 'read' })
  @ApiOperation({ summary: 'List all venues' })
  listVenues(@SportsUser() user: SportsPlatformUser) {
    return this.svc.listVenues(user.institute_id);
  }

  @Get('venues/:id')
  @RequirePermission({ resource: 'venues', action: 'read' })
  @ApiOperation({ summary: 'Get venue details' })
  @ApiParam({ name: 'id', description: 'venue_id of the Venue (e.g. 1)' })
  getVenue(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getVenue(user.institute_id, id);
  }

  @Patch('venues/:id')
  @RequirePermission({ resource: 'venues', action: 'update' })
  @ApiOperation({ summary: 'Update venue details' })
  @ApiParam({ name: 'id', description: 'venue_id of the Venue to update' })
  updateVenue(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVenueDto) {
    return this.svc.updateVenue(user.institute_id, id, dto);
  }

  @Delete('venues/:id')
  @RequirePermission({ resource: 'venues', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete venue' })
  @ApiParam({ name: 'id', description: 'venue_id of the Venue to delete' })
  deleteVenue(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteVenue(user.institute_id, id);
  }

  // ─── Staff ─────────────────────────────────────────────────────────────────
  @Post('staff')
  @RequirePermission({ resource: 'staff', action: 'create' })
  @ApiOperation({ summary: 'Register sports staff (coach, house_master, official)' })
  createStaff(@SportsUser() user: SportsPlatformUser, @Body() dto: CreateStaffDto) {
    return this.svc.createStaff(user.institute_id, dto);
  }

  @Get('staff')
  @RequirePermission({ resource: 'staff', action: 'read' })
  @ApiOperation({ summary: 'List all sports staff' })
  listStaff(@SportsUser() user: SportsPlatformUser) {
    return this.svc.listStaff(user.institute_id);
  }

  @Get('staff/:id')
  @RequirePermission({ resource: 'staff', action: 'read' })
  @ApiOperation({ summary: 'Get staff member details' })
  @ApiParam({ name: 'id', description: 'staff_id of the Staff Member (e.g. 1)' })
  getStaff(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getStaff(user.institute_id, id);
  }

  @Patch('staff/:id')
  @RequirePermission({ resource: 'staff', action: 'update' })
  @ApiOperation({ summary: 'Update staff member' })
  @ApiParam({ name: 'id', description: 'staff_id of the Staff Member to update' })
  updateStaff(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffDto) {
    return this.svc.updateStaff(user.institute_id, id, dto);
  }

  @Delete('staff/:id')
  @RequirePermission({ resource: 'staff', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete staff member' })
  @ApiParam({ name: 'id', description: 'staff_id of the Staff Member to delete' })
  deleteStaff(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteStaff(user.institute_id, id);
  }

  // ─── Participants ──────────────────────────────────────────────────────────
  @Post('participants')
  @RequirePermission({ resource: 'participants', action: 'create' })
  @ApiOperation({ summary: 'Register student sports participant' })
  createParticipant(@SportsUser() user: SportsPlatformUser, @Body() dto: CreateParticipantDto) {
    return this.svc.createParticipant(user.institute_id, dto);
  }

  @Get('participants')
  @RequirePermission({ resource: 'participants', action: 'read' })
  @ApiOperation({ summary: 'List all student sports participants' })
  listParticipants(@SportsUser() user: SportsPlatformUser) {
    return this.svc.listParticipants(user.institute_id);
  }

  @Get('participants/:id')
  @RequirePermission({ resource: 'participants', action: 'read' })
  @ApiOperation({ summary: 'Get student participant details and house membership' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant (e.g. 1)' })
  getParticipant(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getParticipant(user.institute_id, id);
  }

  @Patch('participants/:id')
  @RequirePermission({ resource: 'participants', action: 'update' })
  @ApiOperation({ summary: 'Update student participant info' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant to update' })
  updateParticipant(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateParticipantDto) {
    return this.svc.updateParticipant(user.institute_id, id, dto);
  }

  @Delete('participants/:id')
  @RequirePermission({ resource: 'participants', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete student participant' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant to delete' })
  deleteParticipant(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteParticipant(user.institute_id, id);
  }
}
