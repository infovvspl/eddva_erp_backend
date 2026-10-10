import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { ConfirmationsService } from './confirmations.service';
import { LmsSyncService } from '../lms-sync/lms-sync.service';
import {
  CancelConfirmationDto,
  LinkStudentDto,
  QueryConfirmationDto,
} from './dto/confirmation.dto';

const GUARDS = [
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
] as const;

@ApiTags('Admission / Confirmation')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/admission/applications/:applicationId')
export class ApplicationConfirmationController {
  constructor(
    private readonly svc: ConfirmationsService,
    private readonly lmsSync: LmsSyncService,
  ) {}

  @Post('confirm')
  @RequirePermission({ resource: 'confirmations', action: 'create' })
  @ApiOperation({
    summary:
      'Confirm the admission (atomic). Requires an accepted offer and a fully paid admission fee; issues the enrollment number. 409 if already confirmed',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  async confirm(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    const confirmation = await this.svc.confirm(user, applicationId);
    // Push the new student to the LMS in the background; failures stay `pending` and are retried.
    this.lmsSync.trigger(confirmation.confirmation_id);
    return confirmation;
  }

  @Get('confirmation')
  @RequirePermission({ resource: 'confirmations', action: 'read' })
  @ApiOperation({
    summary:
      "The application's confirmation, enrollment number and Student link status",
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  get(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.svc.getForApplication(user.institute_id, applicationId);
  }

  @Post('confirmation/cancel')
  @RequirePermission({ resource: 'confirmations', action: 'cancel' })
  @ApiOperation({
    summary:
      'Cancel a confirmation (application → cancelled, seat released). Blocked once a Student is linked',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  cancel(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() dto: CancelConfirmationDto,
  ) {
    return this.svc.cancel(user, applicationId, dto);
  }
}

@ApiTags('Admission / Confirmation')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/admission/confirmations')
export class ConfirmationsController {
  constructor(
    private readonly svc: ConfirmationsService,
    private readonly lmsSync: LmsSyncService,
  ) {}

  @Get()
  @RequirePermission({ resource: 'confirmations', action: 'read' })
  @ApiOperation({
    summary:
      'List confirmed admissions (filter by status, program, session, Student link status, date)',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryConfirmationDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'confirmations', action: 'read' })
  @ApiOperation({ summary: 'Get a confirmation' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Post(':id/link-student')
  @RequirePermission({ resource: 'confirmations', action: 'link_student' })
  @ApiOperation({
    summary:
      'Record the Student reference once the school core has created the Student for this confirmed admission',
  })
  @ApiParam({ name: 'id', example: 1 })
  linkStudent(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkStudentDto,
  ) {
    return this.svc.linkStudent(user, id, dto);
  }

  @Post(':id/sync-lms')
  @RequirePermission({ resource: 'confirmations', action: 'link_student' })
  @ApiOperation({
    summary:
      'Retry pushing this confirmed admission to the LMS as a student. Result shows linked / failed / skipped',
  })
  @ApiParam({ name: 'id', example: 1 })
  async syncLms(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.svc.findOne(user.institute_id, id); // tenant check + 404
    return this.lmsSync.sync(id);
  }
}
