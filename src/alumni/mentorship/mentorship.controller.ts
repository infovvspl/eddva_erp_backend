import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { ProgramsService } from './programs.service';
import { MentorsService } from './mentors.service';
import { MatchesService } from './matches.service';
import {
  CreateMatchDto,
  CreateMentorDto,
  CreateProgramDto,
  QueryMatchDto,
  QueryMentorDto,
  QueryProgramDto,
  UpdateMatchDto,
  UpdateMentorDto,
  UpdateProgramDto,
} from './dto/mentorship.dto';

const GUARDS = [
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
] as const;

@ApiTags('Alumni / Mentorship Programs')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/mentorship-programs')
export class MentorshipProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly mentors: MentorsService,
    private readonly matches: MatchesService,
  ) {}

  @Post()
  @StaffOnly()
  @RequirePermission({ resource: 'mentorship_programs', action: 'create' })
  @ApiOperation({
    summary: 'Create a mentorship program (starts open for signup)',
  })
  create(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: CreateProgramDto,
  ) {
    return this.programs.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'mentorship_programs', action: 'read' })
  @ApiOperation({ summary: 'List programs (filter by status)' })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryProgramDto,
  ) {
    return this.programs.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'mentorship_programs', action: 'read' })
  @ApiOperation({ summary: 'Get a program with match counts' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.programs.findOne(user, id);
  }

  @Patch(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'mentorship_programs', action: 'update' })
  @ApiOperation({
    summary: 'Update a program (or move open_for_signup → active)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.programs.update(user, id, dto);
  }

  @Post(':id/close')
  @StaffOnly()
  @RequirePermission({ resource: 'mentorship_programs', action: 'close' })
  @ApiOperation({
    summary:
      'Complete a program; its active matches complete with it and free the mentors',
  })
  @ApiParam({ name: 'id', example: 1 })
  close(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.programs.close(user, user.institute_id, id);
  }

  @Get(':id/mentors')
  @RequirePermission({ resource: 'mentors', action: 'read' })
  @ApiOperation({
    summary:
      'Matching assistance: mentors for this program — filter by expertise, industry, location and availability',
  })
  @ApiParam({ name: 'id', example: 1 })
  async mentorsFor(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryMentorDto,
  ) {
    await this.programs.findOne(user, id);
    return this.mentors.findAll(user, query, { programId: id });
  }

  @Post(':id/matches')
  @StaffOnly()
  @RequirePermission({ resource: 'mentorship_matches', action: 'create' })
  @ApiOperation({
    summary:
      'Match a mentor with a mentee (an alumnus, or a current student by reference). Capacity and duplicates enforced atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  createMatch(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMatchDto,
  ) {
    return this.matches.create(user, id, dto);
  }

  @Get(':id/matches')
  @RequirePermission({ resource: 'mentorship_matches', action: 'read' })
  @ApiOperation({ summary: 'Matches of a program (alumni: only their own)' })
  @ApiParam({ name: 'id', example: 1 })
  listMatches(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryMatchDto,
  ) {
    return this.matches.findAll(user, query, id);
  }
}

@ApiTags('Alumni / Mentors')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/mentors')
export class MentorsController {
  constructor(private readonly svc: MentorsService) {}

  @Post()
  @RequirePermission({ resource: 'mentors', action: 'create' })
  @ApiOperation({
    summary:
      'Become a mentor (verified alumni) or enrol an alumnus (staff, with alumni_id)',
  })
  create(@AlumniUser() user: AlumniPlatformUser, @Body() dto: CreateMentorDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'mentors', action: 'read' })
  @ApiOperation({
    summary: 'Search mentors by expertise / industry / location / availability',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryMentorDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'mentors', action: 'read' })
  @ApiOperation({ summary: 'Get a mentor profile with capacity' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'mentors', action: 'update' })
  @ApiOperation({
    summary:
      'Update mentor profile / availability (own profile, or staff). fully_booked is derived from capacity',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMentorDto,
  ) {
    return this.svc.update(user, id, dto);
  }
}

@ApiTags('Alumni / Mentorship Matches')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/mentorship-matches')
export class MentorshipMatchesController {
  constructor(private readonly svc: MatchesService) {}

  @Get()
  @RequirePermission({ resource: 'mentorship_matches', action: 'read' })
  @ApiOperation({
    summary:
      'Mentorship history across programs (alumni: matches they are part of)',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryMatchDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'mentorship_matches', action: 'read' })
  @ApiOperation({ summary: 'Get a match' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Get(':id/history')
  @RequirePermission({ resource: 'mentorship_matches', action: 'read' })
  @ApiOperation({ summary: 'Status history of a match (audit trail)' })
  @ApiParam({ name: 'id', example: 1 })
  history(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.history(user, id);
  }

  @Patch(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'mentorship_matches', action: 'update' })
  @ApiOperation({
    summary: 'Complete or discontinue an active match (frees the mentor slot)',
  })
  @ApiParam({ name: 'id', example: 1 })
  updateStatus(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMatchDto,
  ) {
    return this.svc.updateStatus(user, id, dto);
  }
}
