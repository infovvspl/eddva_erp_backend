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
  createTournament(@Body() dto: CreateTournamentDto) {
    return this.svc.createTournament(dto);
  }

  @Get('tournaments')
  @RequirePermission({ resource: 'tournaments', action: 'read' })
  @ApiOperation({ summary: 'List all tournaments' })
  listTournaments() {
    return this.svc.listTournaments();
  }

  @Get('tournaments/:id')
  @RequirePermission({ resource: 'tournaments', action: 'read' })
  @ApiOperation({ summary: 'Get tournament details with registered teams and fixtures' })
  @ApiParam({ name: 'id', description: 'tournament_id of the Tournament (e.g. 1)' })
  getTournament(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTournament(id);
  }

  @Patch('tournaments/:id')
  @RequirePermission({ resource: 'tournaments', action: 'update' })
  @ApiOperation({ summary: 'Update tournament status or details' })
  @ApiParam({ name: 'id', description: 'tournament_id of the Tournament to update' })
  updateTournament(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTournamentDto) {
    return this.svc.updateTournament(id, dto);
  }

  // ─── Teams ─────────────────────────────────────────────────────────────────
  @Post('tournaments/:id/teams')
  @RequirePermission({ resource: 'tournaments', action: 'update' })
  @ApiOperation({ summary: 'Register a team / house entry for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  createTeam(@Param('id', ParseIntPipe) tournamentId: number, @Body() dto: CreateTeamDto) {
    return this.svc.createTeam(tournamentId, dto);
  }

  @Get('tournaments/:id/teams')
  @RequirePermission({ resource: 'tournaments', action: 'read' })
  @ApiOperation({ summary: 'List registered teams for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  getTeams(@Param('id', ParseIntPipe) tournamentId: number) {
    return this.svc.getTeams(tournamentId);
  }

  // ─── Fixtures & Results ─────────────────────────────────────────────────────
  @Post('tournaments/:id/fixtures')
  @RequirePermission({ resource: 'fixtures', action: 'create' })
  @ApiOperation({ summary: 'Create / schedule a match fixture in a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  createFixture(@Param('id', ParseIntPipe) tournamentId: number, @Body() dto: CreateFixtureDto) {
    return this.svc.createFixture(tournamentId, dto);
  }

  @Get('tournaments/:id/fixtures')
  @RequirePermission({ resource: 'fixtures', action: 'read' })
  @ApiOperation({ summary: 'List fixtures for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  getFixtures(@Param('id', ParseIntPipe) tournamentId: number) {
    return this.svc.getFixtures(tournamentId);
  }

  @Post('fixtures/:id/result')
  @RequirePermission({ resource: 'fixtures', action: 'record_result' })
  @ApiOperation({ summary: 'Record match result (scores, winner, notes) & auto-update house points' })
  @ApiParam({ name: 'id', description: 'fixture_id of target Fixture (e.g. 1)' })
  recordResult(@Param('id', ParseIntPipe) fixtureId: number, @Body() dto: RecordResultDto) {
    return this.svc.recordResult(fixtureId, dto);
  }

  @Post('fixtures/:id/stats')
  @RequirePermission({ resource: 'fixtures', action: 'record_result' })
  @ApiOperation({ summary: 'Record individual player match statistics (goals, runs, points)' })
  @ApiParam({ name: 'id', description: 'fixture_id of target Fixture (e.g. 1)' })
  recordPlayerStat(@Param('id', ParseIntPipe) fixtureId: number, @Body() dto: RecordPlayerStatDto) {
    return this.svc.recordPlayerStat(fixtureId, dto);
  }
}
