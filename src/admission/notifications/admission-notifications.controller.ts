import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdmissionNotificationStatus } from '@prisma/client';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionNotificationService } from './admission-notification.service';

class QueryNotificationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'offer_issued' })
  @IsOptional()
  @IsString()
  event_type?: string;

  @ApiPropertyOptional({ example: 'admission_application' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  entity_id?: number;

  @ApiPropertyOptional({ enum: AdmissionNotificationStatus })
  @IsOptional()
  @IsEnum(AdmissionNotificationStatus)
  status?: AdmissionNotificationStatus;
}

@ApiTags('Admission / Notification Log')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/notifications')
export class AdmissionNotificationsController {
  constructor(private readonly svc: AdmissionNotificationService) {}

  @Get()
  @RequirePermission({ resource: 'notifications', action: 'read' })
  @ApiOperation({
    summary:
      'Notification outbox. No email/SMS provider is wired up, so entries stay `queued` — nothing is claimed as sent',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryNotificationDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }
}
