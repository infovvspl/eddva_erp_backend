import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SportsTournamentsService } from './sports-tournaments.service';
import { CreateTournamentDto, UpdateTournamentDto } from './dto/create-tournament.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateFixtureDto } from './dto/create-fixture.dto';
import { RecordResultDto } from './dto/record-result.dto';
import { RecordPlayerStatDto } from './dto/record-player-stat.dto';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from '../auth/sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from '../auth/sports-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { SportsUser } from '../auth/sports-user.decorator';
import type { SportsPlatformUser } from '../auth/sports-auth.service';

@ApiTags('Sports / Tournament Management')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('api/sports')
export class SportsTournamentsController {
  constructor(private readonly svc: SportsTournamentsService) {}

  // ─── Tournaments ───────────────────────────────────────────────────────────
  @Post('tournaments')
  @RequirePermission({ resource: 'tournaments', action: 'create' })
  @ApiOperation({ summary: 'Create a tournament (inter-house / inter-school / inter-district)' })
  createTournament(@SportsUser() user: SportsPlatformUser, @Body() dto: CreateTournamentDto) {
    return this.svc.createTournament(user.institute_id, dto);
  }

  @Get('tournaments')
  @RequirePermission({ resource: 'tournaments', action: 'read' })
  @ApiOperation({ summary: 'List all tournaments' })
  listTournaments(@SportsUser() user: SportsPlatformUser) {
    return this.svc.listTournaments(user.institute_id);
  }

  @Get('tournaments/:id')
  @RequirePermission({ resource: 'tournaments', action: 'read' })
  @ApiOperation({ summary: 'Get tournament details with registered teams and fixtures' })
  @ApiParam({ name: 'id', description: 'tournament_id of the Tournament (e.g. 1)' })
  getTournament(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getTournament(user.institute_id, id);
  }

  @Patch('tournaments/:id')
  @RequirePermission({ resource: 'tournaments', action: 'update' })
  @ApiOperation({ summary: 'Update tournament status or details' })
  @ApiParam({ name: 'id', description: 'tournament_id of the Tournament to update' })
  updateTournament(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTournamentDto) {
    return this.svc.updateTournament(user.institute_id, id, dto);
  }

  // ─── Teams ─────────────────────────────────────────────────────────────────
  @Post('tournaments/:id/teams')
  @RequirePermission({ resource: 'tournaments', action: 'update' })
  @ApiOperation({ summary: 'Register a team / house entry for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  createTeam(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) tournamentId: number, @Body() dto: CreateTeamDto) {
    return this.svc.createTeam(user.institute_id, tournamentId, dto);
  }

  @Get('tournaments/:id/teams')
  @RequirePermission({ resource: 'tournaments', action: 'read' })
  @ApiOperation({ summary: 'List registered teams for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  getTeams(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) tournamentId: number) {
    return this.svc.getTeams(user.institute_id, tournamentId);
  }

  // ─── Fixtures & Results ─────────────────────────────────────────────────────
  @Post('tournaments/:id/fixtures')
  @RequirePermission({ resource: 'fixtures', action: 'create' })
  @ApiOperation({ summary: 'Create / schedule a match fixture in a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  createFixture(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) tournamentId: number, @Body() dto: CreateFixtureDto) {
    return this.svc.createFixture(user.institute_id, tournamentId, dto);
  }

  @Get('tournaments/:id/fixtures')
  @RequirePermission({ resource: 'fixtures', action: 'read' })
  @ApiOperation({ summary: 'List fixtures for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  getFixtures(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) tournamentId: number) {
    return this.svc.getFixtures(user.institute_id, tournamentId);
  }

  @Post('fixtures/:id/result')
  @RequirePermission({ resource: 'fixtures', action: 'record_result' })
  @ApiOperation({ summary: 'Record match result (scores, winner, notes) & auto-update house points' })
  @ApiParam({ name: 'id', description: 'fixture_id of target Fixture (e.g. 1)' })
  recordResult(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) fixtureId: number, @Body() dto: RecordResultDto) {
    return this.svc.recordResult(user.institute_id, fixtureId, dto);
  }

  @Post('fixtures/:id/stats')
  @RequirePermission({ resource: 'fixtures', action: 'record_result' })
  @ApiOperation({ summary: 'Record individual player match statistics (goals, runs, points)' })
  @ApiParam({ name: 'id', description: 'fixture_id of target Fixture (e.g. 1)' })
  recordPlayerStat(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) fixtureId: number, @Body() dto: RecordPlayerStatDto) {
    return this.svc.recordPlayerStat(user.institute_id, fixtureId, dto);
  }
}
