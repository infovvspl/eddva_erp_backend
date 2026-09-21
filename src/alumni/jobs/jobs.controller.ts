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
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { JobsService } from './jobs.service';
import { ApplicationsService } from './applications.service';
import {
  ApplyJobDto,
  CreateJobDto,
  QueryApplicationDto,
  QueryJobDto,
  UpdateApplicationStatusDto,
  UpdateJobDto,
} from './dto/job.dto';

const GUARDS = [
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
] as const;

@ApiTags('Alumni / Job Board')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/jobs')
export class JobsController {
  constructor(
    private readonly svc: JobsService,
    private readonly applications: ApplicationsService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'jobs', action: 'create' })
  @ApiOperation({
    summary:
      'Post a job. Alumni: verified alumni only, posted as themselves. Staff: on behalf of an alumnus or a partner company',
  })
  create(@AlumniUser() user: AlumniPlatformUser, @Body() dto: CreateJobDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'jobs', action: 'read' })
  @ApiOperation({
    summary:
      'Search jobs by title/company/location/type/status/industry. Alumni see open postings plus their own',
  })
  findAll(@AlumniUser() user: AlumniPlatformUser, @Query() query: QueryJobDto) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'jobs', action: 'read' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiOperation({ summary: 'Get a job posting' })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'jobs', action: 'update' })
  @ApiOperation({
    summary:
      'Edit a job posting (poster, or staff for any). A future expiry date re-opens an expired posting',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/close')
  @RequirePermission({ resource: 'jobs', action: 'close' })
  @ApiOperation({ summary: 'Close a job posting (no further applications)' })
  @ApiParam({ name: 'id', example: 1 })
  close(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.close(user, id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'jobs', action: 'delete' })
  @ApiOperation({
    summary: 'Delete a posting with no applications (otherwise close it)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }

  @Post(':id/apply')
  @RequirePermission({ resource: 'job_applications', action: 'create' })
  @ApiOperation({
    summary:
      'Apply to a job (verified alumni). Closed / expired postings and duplicate applications are rejected',
  })
  @ApiParam({ name: 'id', example: 1 })
  apply(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyJobDto,
  ) {
    return this.applications.apply(user, id, dto);
  }

  @Get(':id/applications')
  @RequirePermission({ resource: 'job_applications', action: 'read' })
  @ApiOperation({ summary: 'Applications for a job (its poster, or staff)' })
  @ApiParam({ name: 'id', example: 1 })
  listApplications(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryApplicationDto,
  ) {
    return this.applications.listForJob(user, id, query);
  }
}

@ApiTags('Alumni / Job Applications')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/job-applications')
export class JobApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Get()
  @RequirePermission({ resource: 'job_applications', action: 'read' })
  @ApiOperation({
    summary: 'Application history (alumni: their own; staff: any, filterable)',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryApplicationDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'job_applications', action: 'read' })
  @ApiOperation({ summary: 'One application (applicant, job poster or staff)' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'job_applications', action: 'update' })
  @ApiOperation({
    summary:
      'Update application status (applied → shortlisted/rejected/hired; shortlisted → rejected/hired). Job poster or staff',
  })
  @ApiParam({ name: 'id', example: 1 })
  updateStatus(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.svc.updateStatus(user, id, dto);
  }

  @Post(':id/withdraw')
  @RequirePermission({ resource: 'job_applications', action: 'withdraw' })
  @ApiOperation({
    summary: 'Withdraw an application (applied / shortlisted only)',
  })
  @ApiParam({ name: 'id', example: 1 })
  withdraw(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.withdraw(user, id);
  }

  @Get(':id/history')
  @RequirePermission({ resource: 'job_applications', action: 'read' })
  @ApiOperation({ summary: 'Status history of an application (audit trail)' })
  @ApiParam({ name: 'id', example: 1 })
  history(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.history(user, id);
  }

  @Post(':id/resume')
  @RequirePermission({ resource: 'job_applications', action: 'create' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Attach a resume file (PDF/DOCX, ≤5MB) to your application',
  })
  @ApiParam({ name: 'id', example: 1 })
  uploadResume(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadResume(user, id, file);
  }

  @Get(':id/resume')
  @RequirePermission({ resource: 'job_applications', action: 'read' })
  @ApiOperation({
    summary: 'Download the resume file (applicant, job poster or staff only)',
  })
  @ApiParam({ name: 'id', example: 1 })
  async resume(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { absolutePath, mime } = await this.svc.resumeForDownload(user, id);
    res.type(mime);
    res.setHeader('Content-Disposition', 'attachment; filename="resume"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(absolutePath);
  }
}
