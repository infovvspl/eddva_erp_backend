import {
  Body,
  Controller,
  Delete,
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
import { NewslettersService } from './newsletters.service';
import { CommunicationLogsService } from './communication-logs.service';
import {
  CreateNewsletterDto,
  PreviewRecipientsQueryDto,
  QueryCommunicationLogDto,
  QueryNewsletterDto,
  SegmentPreviewDto,
  SendNewsletterDto,
  UpdateCommunicationLogDto,
  UpdateNewsletterDto,
} from './dto/newsletter.dto';

const GUARDS = [
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
] as const;

/** Every communication route is staff-only: alumni never author, preview or send newsletters. */
@ApiTags('Alumni / Newsletters')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@StaffOnly()
@Controller('api/alumni/newsletters')
export class NewslettersController {
  constructor(private readonly svc: NewslettersService) {}

  @Post()
  @RequirePermission({ resource: 'newsletters', action: 'create' })
  @ApiOperation({
    summary: 'Create a draft newsletter with a structured target segment',
  })
  create(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: CreateNewsletterDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'newsletters', action: 'read' })
  @ApiOperation({ summary: 'List newsletters' })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryNewsletterDto,
  ) {
    return this.svc.findAll(user, query);
  }

  // Static path first so it is not captured by ':id'.
  @Post('segment-preview')
  @RequirePermission({ resource: 'newsletters', action: 'read' })
  @ApiOperation({
    summary: 'Preview who a segment would reach (before saving a newsletter)',
  })
  segmentPreview(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: SegmentPreviewDto,
    @Query() query: PreviewRecipientsQueryDto,
  ) {
    return this.svc.previewAdHoc(user, dto.target_segment, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'newsletters', action: 'read' })
  @ApiOperation({ summary: 'Get a newsletter' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'newsletters', action: 'update' })
  @ApiOperation({
    summary: 'Edit a DRAFT newsletter (a sent one is immutable)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsletterDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'newsletters', action: 'delete' })
  @ApiOperation({ summary: 'Delete a DRAFT newsletter' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }

  @Get(':id/preview-recipients')
  @RequirePermission({ resource: 'newsletters', action: 'read' })
  @ApiOperation({
    summary:
      'Who the newsletter would reach right now (segment evaluated against current data; verified, active, opted-in only)',
  })
  @ApiParam({ name: 'id', example: 1 })
  preview(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PreviewRecipientsQueryDto,
  ) {
    return this.svc.previewRecipients(user, id, query);
  }

  @Post(':id/send')
  @RequirePermission({ resource: 'newsletters', action: 'send' })
  @ApiOperation({
    summary:
      'Send (once): resolves the segment now and queues one communication log per recipient/channel in a single transaction',
  })
  @ApiParam({ name: 'id', example: 1 })
  send(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendNewsletterDto,
  ) {
    return this.svc.send(user, id, dto);
  }

  @Get(':id/stats')
  @RequirePermission({ resource: 'communication', action: 'read' })
  @ApiOperation({
    summary: 'Delivery / open / click statistics of a newsletter',
  })
  @ApiParam({ name: 'id', example: 1 })
  stats(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.stats(user, id);
  }
}

@ApiTags('Alumni / Communication Logs')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@StaffOnly()
@Controller('api/alumni/communication-logs')
export class CommunicationLogsController {
  constructor(private readonly svc: CommunicationLogsService) {}

  @Get()
  @RequirePermission({ resource: 'communication', action: 'read' })
  @ApiOperation({
    summary: 'Delivery logs — filter by newsletter, alumnus, channel, status',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryCommunicationLogDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'communication', action: 'update' })
  @ApiOperation({
    summary:
      'Record delivery feedback (sent / opened / clicked / failed) from the mail or SMS provider; statuses only move forward',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommunicationLogDto,
  ) {
    return this.svc.updateStatus(user, id, dto);
  }
}
