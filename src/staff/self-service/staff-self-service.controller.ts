import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StaffMembersService } from '../directory/staff-members.service';
import { LeaveBalancesService } from '../leave-balances/leave-balances.service';
import { LeaveApplicationsService } from '../leave-applications/leave-applications.service';
import { StaffNotificationService } from '../notifications/staff-notification.service';
import { ApplyOwnLeaveDto } from './dto/apply-own-leave.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffSelfServiceGuard } from './staff-self-service.guard';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

/**
 * Teacher self-service surface — everything here is implicitly scoped to
 * `actor.self_staff_id` (set only by the teacher SSO exchange). A teacher
 * can never pass a different staff_id; there is no admin-equivalent route
 * here for listing/acting on anyone else's records.
 */
@ApiTags('Staff / Self-Service (teacher)')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffSelfServiceGuard)
@Controller('api/staff/me')
export class StaffSelfServiceController {
  constructor(
    private readonly members: StaffMembersService,
    private readonly leaveBalances: LeaveBalancesService,
    private readonly leaveApplications: LeaveApplicationsService,
    private readonly notifications: StaffNotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get my own staff profile' })
  getProfile(@StaffUser() actor: StaffPlatformUser) {
    return this.members.findOne(actor.institute_id, actor.self_staff_id!);
  }

  @Get('leave-balances')
  @ApiOperation({ summary: 'Get my own leave balances' })
  getLeaveBalances(@StaffUser() actor: StaffPlatformUser, @Query('year') year?: string) {
    return this.leaveBalances.findForStaff(actor.institute_id, actor.self_staff_id!, year ? Number(year) : undefined);
  }

  @Get('leave-applications')
  @ApiOperation({ summary: 'List my own leave applications' })
  getLeaveApplications(@StaffUser() actor: StaffPlatformUser, @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.leaveApplications.findAll(actor.institute_id, {
      staff_id: actor.self_staff_id,
      status: status as any,
      limit: limit ? Number(limit) : 100,
    } as any);
  }

  @Post('leave-applications')
  @ApiOperation({ summary: 'File a leave application for myself' })
  applyLeave(@StaffUser() actor: StaffPlatformUser, @Body() dto: ApplyOwnLeaveDto) {
    return this.leaveApplications.apply(actor, { ...dto, staff_id: actor.self_staff_id! });
  }

  @Get('notifications')
  @ApiOperation({ summary: 'List my own notifications (salary paid, leave decisions, etc.) plus institute-wide notices' })
  getNotifications(@StaffUser() actor: StaffPlatformUser, @Query('limit') limit?: string) {
    return this.notifications.findForRecipient(actor.institute_id, actor.eddva_user_id, {
      limit: limit ? Number(limit) : 50,
    });
  }

  @Patch('leave-applications/:id/cancel')
  @ApiOperation({ summary: 'Cancel my own pending (or not-yet-started approved) leave application' })
  async cancelLeave(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    const application = await this.leaveApplications.findOne(actor.institute_id, id);
    if (application.staff_id !== actor.self_staff_id) {
      throw new ForbiddenException('This is not your leave application');
    }
    return this.leaveApplications.cancel(actor, id);
  }
}
