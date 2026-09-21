import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import {
  RequirePermission,
  RequirePermissions,
} from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAccessService } from '../common/hostel-access.service';
import {
  HostelReportQueryDto,
  REPORT_DATA_PERMISSION,
  REPORT_NAMES,
  ReportName,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Hostel / Reports')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/reports')
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
    private readonly access: HostelAccessService,
  ) {}

  private async resolve(
    user: HostelPlatformUser,
    report: string,
  ): Promise<ReportName> {
    if (!(REPORT_NAMES as readonly string[]).includes(report)) {
      throw new BadRequestException(
        `Unknown report "${report}". Use one of: ${REPORT_NAMES.join(', ')}`,
      );
    }
    // Reports that expose finance / discipline / visitor data also need that module's read permission.
    const extra = REPORT_DATA_PERMISSION[report as ReportName];
    if (extra) {
      await this.access.assertPermission(user, extra.resource, extra.action);
    }
    return report as ReportName;
  }

  @Get(':report')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Run a report: occupancy, room-occupancy, residents, allotment-history, gate-movement, overdue-residents, attendance, unaccounted-absences, visitors, mess-consumption, complaints, fee-outstanding, fee-payments, discipline',
  })
  @ApiParam({ name: 'report', enum: REPORT_NAMES })
  async run(
    @HostelUser() user: HostelPlatformUser,
    @Param('report') report: string,
    @Query() query: HostelReportQueryDto,
  ) {
    return this.svc.run(
      user.institute_id,
      await this.resolve(user, report),
      query,
    );
  }

  @Get(':report/export')
  @RequirePermissions(
    { resource: 'reports', action: 'read' },
    { resource: 'reports', action: 'export' },
  )
  @ApiOperation({
    summary:
      'Export any report as CSV (same filters as the JSON endpoint). Requires reports:read and reports:export',
  })
  @ApiParam({ name: 'report', enum: REPORT_NAMES })
  async export(
    @HostelUser() user: HostelPlatformUser,
    @Param('report') report: string,
    @Query() query: HostelReportQueryDto,
    @Res() res: Response,
  ) {
    const name = await this.resolve(user, report);
    const csv = await this.svc.exportCsv(user.institute_id, name, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hostel-${name}-report.csv"`,
    );
    res.send(csv);
  }
}
