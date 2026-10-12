import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { LeaveApplicationsService } from './leave-applications.service';
import { CreateLeaveApplicationDto } from './dto/create-leave-application.dto';
import { DecideLeaveApplicationDto } from './dto/decide-leave-application.dto';
import { QueryLeaveApplicationDto } from './dto/query-leave-application.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Leave Applications')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/leave-applications')
export class LeaveApplicationsController {
  constructor(private readonly svc: LeaveApplicationsService) {}

  @Post()
  @RequirePermission({ resource: 'leave_applications', action: 'create' })
  @ApiOperation({ summary: 'File a leave application for a staff member' })
  apply(@StaffUser() actor: StaffPlatformUser, @Body() dto: CreateLeaveApplicationDto) {
    return this.svc.apply(actor, dto);
  }

  @Get()
  @RequirePermission({ resource: 'leave_applications', action: 'read' })
  @ApiOperation({ summary: 'List leave applications, filterable by staff/leave type/status' })
  findAll(@StaffUser() actor: StaffPlatformUser, @Query() query: QueryLeaveApplicationDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'leave_applications', action: 'read' })
  @ApiOperation({ summary: 'Get a leave application by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id/approve')
  @RequirePermission({ resource: 'leave_applications', action: 'approve' })
  @ApiOperation({ summary: 'Approve a pending leave application (credits the days against the leave balance)' })
  @ApiParam({ name: 'id', example: 1 })
  approve(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.approve(actor, id);
  }

  @Patch(':id/reject')
  @RequirePermission({ resource: 'leave_applications', action: 'reject' })
  @ApiOperation({ summary: 'Reject a pending leave application' })
  @ApiParam({ name: 'id', example: 1 })
  reject(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideLeaveApplicationDto,
  ) {
    return this.svc.reject(actor, id, dto);
  }

  @Patch(':id/cancel')
  @RequirePermission({ resource: 'leave_applications', action: 'cancel' })
  @ApiOperation({ summary: "Cancel a pending application, or an approved one that hasn't started yet" })
  @ApiParam({ name: 'id', example: 1 })
  cancel(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.cancel(actor, id);
  }
}
