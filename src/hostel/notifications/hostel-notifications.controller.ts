import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import {
  HostelNotificationAudience,
  HostelNotificationStatus,
} from '@prisma/client';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelNotificationService } from './hostel-notification.service';

class QueryNotificationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'gate_pass_overdue' })
  @IsOptional()
  @IsString()
  event_type?: string;

  @ApiPropertyOptional({ example: 'hostel_gate_pass' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  entity_id?: number;

  @ApiPropertyOptional({ enum: HostelNotificationAudience })
  @IsOptional()
  @IsEnum(HostelNotificationAudience)
  audience?: HostelNotificationAudience;

  @ApiPropertyOptional({ enum: HostelNotificationStatus })
  @IsOptional()
  @IsEnum(HostelNotificationStatus)
  status?: HostelNotificationStatus;
}

@ApiTags('Hostel / Notification Log')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/notifications')
export class HostelNotificationsController {
  constructor(private readonly svc: HostelNotificationService) {}

  @Get()
  @RequirePermission({ resource: 'notifications', action: 'read' })
  @ApiOperation({
    summary:
      'Notification outbox. No email/SMS provider is wired up, so entries stay `queued` — nothing is claimed as sent',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryNotificationDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }
}
