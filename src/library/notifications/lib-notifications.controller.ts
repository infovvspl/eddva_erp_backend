import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LibNotificationService } from './lib-notification.service';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';

@ApiTags('Library / Notifications')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/notifications')
export class LibNotificationsController {
  constructor(private readonly notificationService: LibNotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get system notification logs for library events (overdue, fines, reservations)' })
  @ApiQuery({ name: 'member_id', required: false, type: Number, description: 'Optional member_id filter' })
  findAll(@Query('member_id') memberId?: string) {
    const parsedId = memberId ? parseInt(memberId, 10) : undefined;
    return this.notificationService.findAllLogs(parsedId);
  }
}
