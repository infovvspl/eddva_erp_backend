import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';

import { DashboardService } from './dashboard.service';

@ApiTags('Transport / Dashboard')
@ApiBearerAuth()
@UseGuards(
  TransportJwtGuard,
  TransportInstituteAdminViewOnlyGuard,
  TransportPermissionsGuard,
)
@Controller('api/transport/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('summary')
  @RequirePermission({
    resource: 'dashboard',
    action: 'read',
  })
  @ApiOperation({
    summary:
      'Transport dashboard summary (fleet, drivers, passengers, fee collection, alerts)',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    example: '2026-08-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    example: '2026-08-31',
  })
  getSummary(
    @TransportUser() user: TransportPlatformUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getSummary(
      user.institute_id,
      from,
      to,
    );
  }
}