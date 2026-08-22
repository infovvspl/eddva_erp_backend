import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SportsRecordsService } from './sports-records.service';
import { CreateSportsRecordDto } from './dto/create-record.dto';
import { IssueAwardDto } from './dto/issue-award.dto';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from '../auth/sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from '../auth/sports-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

@ApiTags('Sports / Records & Awards')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('sports')
export class SportsRecordsController {
  constructor(private readonly svc: SportsRecordsService) {}

  // ─── Sports Records ────────────────────────────────────────────────────────
  @Post('records')
  @RequirePermission({ resource: 'records', action: 'create' })
  @ApiOperation({ summary: 'Create manual sports record entry (personal best, milestone, win)' })
  createRecord(@Body() dto: CreateSportsRecordDto) {
    return this.svc.createRecord(dto);
  }

  @Get('participants/:id/records')
  @RequirePermission({ resource: 'records', action: 'read' })
  @ApiOperation({ summary: 'Get achievements & records for a student participant' })
  @ApiParam({ name: 'id', description: 'participant_id of the Student Participant (e.g. 1)' })
  getParticipantRecords(@Param('id', ParseIntPipe) participantId: number) {
    return this.svc.getParticipantRecords(participantId);
  }

  @Get('sports/:id/records')
  @RequirePermission({ resource: 'records', action: 'read' })
  @ApiOperation({ summary: 'Get all records registered under a specific sport' })
  @ApiParam({ name: 'id', description: 'sport_id of the Sport (e.g. 1)' })
  getSportRecords(@Param('id', ParseIntPipe) sportId: number) {
    return this.svc.getSportRecords(sportId);
  }

  // ─── Awards ────────────────────────────────────────────────────────────────
  @Post('tournaments/:id/awards')
  @RequirePermission({ resource: 'awards', action: 'create' })
  @ApiOperation({ summary: 'Issue award / medal / certificate for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  issueAward(@Param('id', ParseIntPipe) tournamentId: number, @Body() dto: IssueAwardDto) {
    return this.svc.issueAward(tournamentId, dto);
  }

  @Get('tournaments/:id/awards')
  @RequirePermission({ resource: 'awards', action: 'read' })
  @ApiOperation({ summary: 'List awards issued for a tournament' })
  @ApiParam({ name: 'id', description: 'tournament_id of target Tournament (e.g. 1)' })
  getTournamentAwards(@Param('id', ParseIntPipe) tournamentId: number) {
    return this.svc.getTournamentAwards(tournamentId);
  }
}
