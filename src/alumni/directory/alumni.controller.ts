import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { PageQueryDto } from '../common/page-query.dto';
import { AlumniNotificationService } from '../notifications/alumni-notification.service';
import { AlumniReportQueryDto } from '../reports/dto/report-query.dto';
import { ReportsService } from '../reports/reports.service';
import { toCsv } from '../common/csv.util';
import { AlumniService } from './alumni.service';
import { GroupsService } from './groups.service';
import {
  CreateAlumniDto,
  IssueAccountDto,
  QueryAlumniDto,
  QueryPublicDirectoryDto,
  RejectAlumniDto,
  SubmitVerificationDto,
  UpdateAlumniDto,
} from './dto/alumni.dto';

const PHOTO_BODY = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
  },
};
const PHOTO_LIMIT = { limits: { fileSize: 2 * 1024 * 1024 } };

/** Unauthenticated: public + verified profiles only, never contact details. */
@ApiTags('Alumni / Public Directory')
@Controller('api/alumni/public')
export class PublicDirectoryController {
  constructor(private readonly svc: AlumniService) {}

  @Get('directory')
  @ApiOperation({
    summary:
      'Public alumni directory — only verified alumni who chose "public" visibility, without e-mail/phone/LinkedIn',
  })
  directory(@Query() query: QueryPublicDirectoryDto) {
    return this.svc.publicDirectory(query);
  }
}

@ApiTags('Alumni / Directory')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@Controller('api/alumni/profiles')
export class AlumniProfilesController {
  constructor(
    private readonly svc: AlumniService,
    private readonly groups: GroupsService,
    private readonly reports: ReportsService,
  ) {}

  @Post()
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'create' })
  @ApiOperation({
    summary:
      'Create an alumni profile (staff). Duplicate e-mail / student_ref → 409',
  })
  create(@AlumniUser() user: AlumniPlatformUser, @Body() dto: CreateAlumniDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'alumni', action: 'read' })
  @ApiOperation({
    summary:
      'Directory list / search / filter (name, batch, graduation year, program, company, designation, industry, city, country, group, verification). Alumni see verified profiles their visibility allows',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryAlumniDto,
  ) {
    return this.svc.findAll(user, query);
  }

  // Declared before ':id' so "export" is not parsed as an id.
  @Get('export')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'export' })
  @ApiOperation({
    summary:
      'Export the directory as CSV (up to 10,000 rows) — filter by batch_year, program, status, registration dates',
  })
  async exportDirectory(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: AlumniReportQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.reports.run(
      user.institute_id,
      'alumni-directory',
      query,
      true,
    );
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="alumni-directory.csv"',
      'Cache-Control': 'private, no-store',
    });
    res.send(toCsv(result.rows, result.columns));
  }

  @Get(':id')
  @RequirePermission({ resource: 'alumni', action: 'read' })
  @ApiOperation({
    summary:
      'Get a profile (private/alumni-only profiles are hidden as 404 from viewers who may not see them)',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'alumni', action: 'update' })
  @ApiOperation({
    summary:
      'Update a profile. Staff: any field. Alumni: only their own profile and only self-editable fields',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAlumniDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'delete' })
  @ApiOperation({
    summary:
      'Deactivate a profile (soft delete: leaves the directory, blocks portal login, keeps all history)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deactivate(user, id);
  }

  @Post(':id/reactivate')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'update' })
  @ApiOperation({ summary: 'Reactivate a deactivated profile' })
  @ApiParam({ name: 'id', example: 1 })
  reactivate(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.reactivate(user, id);
  }

  @Post(':id/verify')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'verify' })
  @ApiOperation({
    summary: 'Verify an alumni profile (pending/rejected → verified)',
  })
  @ApiParam({ name: 'id', example: 1 })
  verify(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.verify(user, id);
  }

  @Post(':id/reject')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'verify' })
  @ApiOperation({
    summary: 'Reject (or revoke) verification, with an optional reason',
  })
  @ApiParam({ name: 'id', example: 1 })
  reject(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAlumniDto,
  ) {
    return this.svc.reject(user, id, dto);
  }

  @Get(':id/verification-history')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'verify' })
  @ApiOperation({ summary: 'Verification history (from the audit trail)' })
  @ApiParam({ name: 'id', example: 1 })
  verificationHistory(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.verificationHistory(user, id);
  }

  @Get(':id/possible-duplicates')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'verify' })
  @ApiOperation({
    summary:
      'Profiles that may be the same person (same name + batch, or same phone) — candidates for staff review, never auto-merged',
  })
  @ApiParam({ name: 'id', example: 1 })
  possibleDuplicates(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.possibleDuplicates(user, id);
  }

  @Post(':id/account')
  @StaffOnly()
  @RequirePermission({ resource: 'alumni', action: 'issue_account' })
  @ApiOperation({
    summary:
      'Issue (or reset the password of) the portal login for an existing profile; the e-mail is the login name',
  })
  @ApiParam({ name: 'id', example: 1 })
  issueAccount(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueAccountDto,
  ) {
    return this.svc.issueAccount(user, id, dto);
  }

  @Get(':id/groups')
  @RequirePermission({ resource: 'groups', action: 'read' })
  @ApiOperation({ summary: 'Groups this alumnus belongs to' })
  @ApiParam({ name: 'id', example: 1 })
  groupsOf(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.groups.groupsOf(user, id);
  }

  @Post(':id/photo')
  @RequirePermission({ resource: 'alumni', action: 'update' })
  @UseInterceptors(FileInterceptor('file', PHOTO_LIMIT))
  @ApiConsumes('multipart/form-data')
  @ApiBody(PHOTO_BODY)
  @ApiOperation({
    summary:
      'Upload a profile photo (JPEG/PNG/WebP, ≤2MB). Own photo, or staff',
  })
  @ApiParam({ name: 'id', example: 1 })
  uploadPhoto(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadPhoto(user, id, file);
  }

  @Get(':id/photo')
  @RequirePermission({ resource: 'alumni', action: 'read' })
  @ApiOperation({
    summary:
      'Download a profile photo — only if the viewer may see the profile',
  })
  @ApiParam({ name: 'id', example: 1 })
  async photo(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { absolutePath, mime } = await this.svc.photoForDownload(user, id);
    res.type(mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(absolutePath);
  }
}

/** Self-service for alumni portal accounts. */
@ApiTags('Alumni / My Profile')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@Controller('api/alumni/me')
export class AlumniMeController {
  constructor(
    private readonly svc: AlumniService,
    private readonly notifications: AlumniNotificationService,
  ) {}

  @Get()
  @RequirePermission({ resource: 'alumni', action: 'read' })
  @ApiOperation({ summary: 'My profile (alumni portal accounts)' })
  me(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.me(user);
  }

  @Patch()
  @RequirePermission({ resource: 'alumni', action: 'update' })
  @ApiOperation({
    summary:
      'Update my profile (phone, company, designation, industry, location, LinkedIn, visibility, contact & newsletter preferences)',
  })
  update(@AlumniUser() user: AlumniPlatformUser, @Body() dto: UpdateAlumniDto) {
    return this.svc.update(user, this.ownId(user), dto);
  }

  @Get('verification')
  @RequirePermission({ resource: 'alumni', action: 'read' })
  @ApiOperation({ summary: 'My verification status' })
  verification(@AlumniUser() user: AlumniPlatformUser) {
    return this.svc.verificationStatus(user);
  }

  @Post('verification-request')
  @RequirePermission({ resource: 'alumni', action: 'update' })
  @ApiOperation({
    summary:
      'Submit (or re-submit after a rejection) a verification request with optional evidence notes',
  })
  submitVerification(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: SubmitVerificationDto,
  ) {
    return this.svc.submitVerification(user, dto);
  }

  @Post('photo')
  @RequirePermission({ resource: 'alumni', action: 'update' })
  @UseInterceptors(FileInterceptor('file', PHOTO_LIMIT))
  @ApiConsumes('multipart/form-data')
  @ApiBody(PHOTO_BODY)
  @ApiOperation({ summary: 'Upload my profile photo (JPEG/PNG/WebP, ≤2MB)' })
  uploadPhoto(
    @AlumniUser() user: AlumniPlatformUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadPhoto(user, this.ownId(user), file);
  }

  @Get('notifications')
  @RequirePermission({ resource: 'notifications', action: 'read' })
  @ApiOperation({ summary: 'My in-app notifications' })
  notificationsOf(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: PageQueryDto,
  ) {
    return this.notifications.findMine(
      user.institute_id,
      this.ownId(user),
      query,
    );
  }

  private ownId(user: AlumniPlatformUser): number {
    // The permissions guard has resolved alumni_id from the database.
    if (user.alumni_id === undefined) {
      throw new ForbiddenException(
        'This endpoint is for alumni portal accounts only',
      );
    }
    return user.alumni_id;
  }
}
