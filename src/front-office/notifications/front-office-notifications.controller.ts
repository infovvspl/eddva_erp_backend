import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeNotificationService } from './front-office-notification.service';

@ApiTags('Front Office / Notifications')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/notifications')
export class FrontOfficeNotificationsController {
  constructor(private readonly notificationService: FrontOfficeNotificationService) {}

  @Get()
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({ summary: 'List Front Office notification log entries' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'recipientEmployeeId', required: false })
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('recipientEmployeeId') recipientEmployeeId?: string,
  ) {
    return this.notificationService.findAll({
      entityType,
      entityId: entityId ? Number(entityId) : undefined,
      recipientEmployeeId: recipientEmployeeId ? Number(recipientEmployeeId) : undefined,
    });
  }
}
