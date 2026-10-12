import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { StaffNotificationStatus } from '@prisma/client';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';
import { StaffNotificationService } from './staff-notification.service';

class QueryStaffNotificationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'leave_application_approved' })
  @IsOptional()
  @IsString()
  event_type?: string;

  @ApiPropertyOptional({ example: 'staff_leave_application' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  entity_id?: number;

  @ApiPropertyOptional({ enum: StaffNotificationStatus })
  @IsOptional()
  @IsEnum(StaffNotificationStatus)
  status?: StaffNotificationStatus;
}

@ApiTags('Staff / Notification Log')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/notifications')
export class StaffNotificationsController {
  constructor(private readonly svc: StaffNotificationService) {}

  @Get()
  @RequirePermission({ resource: 'notifications', action: 'read' })
  @ApiOperation({
    summary:
      'Notification outbox. No email/SMS provider is wired up, so entries stay `queued` — nothing is claimed as sent',
  })
  findAll(@StaffUser() user: StaffPlatformUser, @Query() query: QueryStaffNotificationDto) {
    return this.svc.findAll(user.institute_id, query);
  }
}
