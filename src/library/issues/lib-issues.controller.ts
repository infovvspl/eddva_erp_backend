import { Controller, Post, Get, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { IssueService } from './issue.service';
import { ReturnService } from './return.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ReturnIssueDto } from './dto/return-issue.dto';
import { RenewIssueDto } from './dto/renew-issue.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Issues & Returns')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/issues')
export class LibIssuesController {
  constructor(
    private readonly issueService: IssueService,
    private readonly returnService: ReturnService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'issues', action: 'issue' })
  @ApiOperation({ summary: 'Issue a copy to a member (librarian)' })
  issue(@LibUser() user: LibPlatformUser, @Body() dto: CreateIssueDto) {
    return this.issueService.issueBook(user.institute_id, dto);
  }

  @Get('overdue')
  @RequirePermission({ resource: 'issues', action: 'read' })
  @ApiOperation({ summary: 'List all overdue book loan records (librarian)' })
  findOverdue(@LibUser() user: LibPlatformUser) {
    return this.issueService.findOverdue(user.institute_id);
  }

  @Get()
  @RequirePermission({ resource: 'issues', action: 'read' })
  @ApiOperation({ summary: 'List all issue records (librarian)' })
  @ApiQuery({ name: 'status', required: false, description: 'Optional status filter: issued, overdue, returned' })
  findAll(@LibUser() user: LibPlatformUser, @Query('status') status?: string) {
    return this.issueService.findAll(user.institute_id, status);
  }

  @Post(':id/return')
  @RequirePermission({ resource: 'issues', action: 'return' })
  @ApiOperation({ summary: 'Return a copy — computes fine automatically (librarian)' })
  @ApiParam({ name: 'id', description: 'issue_id of target Book Issue Record (e.g. 1)' })
  return(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnIssueDto,
  ) {
    return this.returnService.returnBook(user.institute_id, id, dto);
  }

  @Post(':id/renew')
  @RequirePermission({ resource: 'issues', action: 'renew' })
  @ApiOperation({ summary: 'Renew loan — extends due_date (librarian)' })
  @ApiParam({ name: 'id', description: 'issue_id of target Book Issue Record to renew (e.g. 1)' })
  renew(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewIssueDto,
  ) {
    return this.issueService.renewIssue(user.institute_id, id, dto);
  }

  @Get(':id')
  @RequirePermission({ resource: 'issues', action: 'read' })
  @ApiOperation({ summary: 'Get issue record detail' })
  @ApiParam({ name: 'id', description: 'issue_id of target Book Issue Record (e.g. 1)' })
  findOne(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.issueService.findOne(user.institute_id, id);
  }
}
