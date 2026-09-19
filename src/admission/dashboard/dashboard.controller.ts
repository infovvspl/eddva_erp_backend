import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionReportQueryDto } from '../reports/dto/report-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Admission / Dashboard')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  @RequirePermission({ resource: 'dashboard', action: 'read' })
  @ApiOperation({
    summary:
      'Admission dashboard: KPI cards, the enquiry → confirmed funnel, applications by status, seat summary and recent activity (filter by session, program, date range)',
  })
  summary(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: AdmissionReportQueryDto,
  ) {
    return this.svc.summary(user.institute_id, query);
  }
}
