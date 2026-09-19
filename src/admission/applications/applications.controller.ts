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
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { ApplicationsService } from './applications.service';
import {
  ChangeApplicationStatusDto,
  CreateApplicationDto,
  QueryApplicationDto,
  UpdateApplicationDto,
} from './dto/application.dto';

@ApiTags('Admission / Applications')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/applications')
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Post()
  @RequirePermission({ resource: 'applications', action: 'create' })
  @ApiOperation({
    summary:
      'Create an application (draft) for a new or existing applicant, optionally linked to a source enquiry. Application number is system-generated',
  })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'applications', action: 'read' })
  @ApiOperation({
    summary:
      'List/search/filter/paginate applications with document, fee, test, interview and offer status columns',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryApplicationDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'applications', action: 'read' })
  @ApiOperation({
    summary:
      'Application detail: applicant, documents, fees, test, interview, merit, offer, payments, confirmation and seat availability',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'applications', action: 'update' })
  @ApiOperation({
    summary:
      'Update session/program/date while the application is still editable',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Get(':id/status')
  @RequirePermission({ resource: 'applications', action: 'read' })
  @ApiOperation({
    summary:
      'Authoritative pipeline status, permitted next statuses, and supporting child-stage information',
  })
  @ApiParam({ name: 'id', example: 1 })
  getStatus(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getStatus(user.institute_id, id);
  }

  @Post(':id/status')
  @RequirePermission({ resource: 'applications', action: 'change_status' })
  @ApiOperation({
    summary:
      'Change application status. Review decisions (under_review/shortlisted/waitlisted/rejected) additionally require applications:review; offered/admitted are workflow-only',
  })
  @ApiParam({ name: 'id', example: 1 })
  changeStatus(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeApplicationStatusDto,
  ) {
    return this.svc.changeStatus(user, id, dto);
  }

  @Get(':id/activity')
  @RequirePermission({ resource: 'applications', action: 'read' })
  @ApiOperation({
    summary:
      'Audit trail: status changes, document decisions, evaluation scores, offers, payments — with actor and timestamp',
  })
  @ApiParam({ name: 'id', example: 1 })
  activity(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.activity(user.institute_id, id);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'applications', action: 'delete' })
  @ApiOperation({
    summary: 'Soft-delete a draft/rejected/cancelled application',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }
}
