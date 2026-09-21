import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { AlumniNotificationService } from './alumni-notification.service';

@ApiTags('Alumni / Notifications')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@StaffOnly()
@Controller('api/alumni/notifications')
export class AlumniNotificationsController {
  constructor(private readonly svc: AlumniNotificationService) {}

  @Get()
  @RequirePermission({ resource: 'notifications', action: 'read' })
  @ApiOperation({
    summary:
      'The notification outbox (staff): filter by event type, entity, audience, status. An alumnus reads their own at GET /api/alumni/me/notifications',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryNotificationDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }
}
