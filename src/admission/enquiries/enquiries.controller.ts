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
import {
  RequirePermission,
  RequirePermissions,
} from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { EnquiriesService } from './enquiries.service';
import {
  AssignEnquiryDto,
  ChangeEnquiryStatusDto,
  ConvertEnquiryDto,
  CreateAdmissionEnquiryDto,
  CreateFollowupDto,
  QueryAdmissionEnquiryDto,
  UpdateAdmissionEnquiryDto,
  UpdateFollowupDto,
} from './dto/enquiry.dto';

@ApiTags('Admission / Enquiries & Leads')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/enquiries')
export class EnquiriesController {
  constructor(private readonly svc: EnquiriesService) {}

  @Post()
  @RequirePermission({ resource: 'enquiries', action: 'create' })
  @ApiOperation({ summary: 'Create an enquiry' })
  create(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: CreateAdmissionEnquiryDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({
    summary:
      'List/search/filter/paginate enquiries (status, source, program, assignee, follow-up due, date range)',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryAdmissionEnquiryDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({
    summary: 'Get an enquiry with follow-up history and linked application',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'enquiries', action: 'update' })
  @ApiOperation({
    summary: 'Update enquiry details (not allowed once converted)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionEnquiryDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/assign')
  @RequirePermission({ resource: 'enquiries', action: 'update' })
  @ApiOperation({ summary: 'Assign the enquiry to an admission officer' })
  @ApiParam({ name: 'id', example: 1 })
  assign(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignEnquiryDto,
  ) {
    return this.svc.assign(user, id, dto);
  }

  @Post(':id/status')
  @RequirePermission({ resource: 'enquiries', action: 'update' })
  @ApiOperation({
    summary:
      'Change enquiry status (new → contacted → application_started / lost)',
  })
  @ApiParam({ name: 'id', example: 1 })
  changeStatus(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeEnquiryStatusDto,
  ) {
    return this.svc.changeStatus(user, id, dto);
  }

  @Post(':id/followups')
  @RequirePermission({ resource: 'enquiries', action: 'followup' })
  @ApiOperation({
    summary: 'Log a follow-up (moves a new enquiry to contacted)',
  })
  @ApiParam({ name: 'id', example: 1 })
  addFollowup(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFollowupDto,
  ) {
    return this.svc.addFollowup(user, id, dto);
  }

  @Get(':id/followups')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'Follow-up history for an enquiry' })
  @ApiParam({ name: 'id', example: 1 })
  listFollowups(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.listFollowups(user.institute_id, id);
  }

  @Patch(':id/followups/:followupId')
  @RequirePermission({ resource: 'enquiries', action: 'followup' })
  @ApiOperation({ summary: 'Edit a follow-up' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiParam({ name: 'followupId', example: 1 })
  updateFollowup(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('followupId', ParseIntPipe) followupId: number,
    @Body() dto: UpdateFollowupDto,
  ) {
    return this.svc.updateFollowup(user, id, followupId, dto);
  }

  @Post(':id/convert')
  @RequirePermissions(
    { resource: 'enquiries', action: 'convert' },
    { resource: 'applications', action: 'create' },
  )
  @ApiOperation({
    summary:
      'Convert an enquiry into an application (creates/reuses the applicant, links source_enquiry_id, marks the enquiry converted — atomically)',
  })
  @ApiParam({ name: 'id', example: 1 })
  convert(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertEnquiryDto,
  ) {
    return this.svc.convert(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'enquiries', action: 'delete' })
  @ApiOperation({ summary: 'Soft-delete an unconverted enquiry' })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }
}
