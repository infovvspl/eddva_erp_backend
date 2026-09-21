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
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { AlumniAccessService } from '../common/alumni-access.service';
import { buildMeta } from '../common/pagination.util';
import { toCsv } from '../common/csv.util';
import {
  AlumniReportQueryDto,
  REPORT_DATA_PERMISSION,
  REPORT_NAMES,
  ReportName,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Alumni / Reports')
@ApiBearerAuth()
@UseGuards(
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
)
@StaffOnly()
@Controller('api/alumni/reports')
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
    private readonly access: AlumniAccessService,
  ) {}

  private async resolve(
    user: AlumniPlatformUser,
    report: string,
  ): Promise<ReportName> {
    if (!(REPORT_NAMES as readonly string[]).includes(report)) {
      throw new BadRequestException(
        `Unknown report "${report}". Use one of: ${REPORT_NAMES.join(', ')}`,
      );
    }
    // A report that shows another module's data also needs that module's read permission.
    const extra = REPORT_DATA_PERMISSION[report as ReportName];
    if (extra) {
      await this.access.assertPermission(user, extra.resource, extra.action);
    }
    return report as ReportName;
  }

  @Get(':report')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary: `Run a report: ${REPORT_NAMES.join(', ')}`,
  })
  @ApiParam({ name: 'report', enum: REPORT_NAMES })
  async run(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('report') report: string,
    @Query() query: AlumniReportQueryDto,
  ) {
    const result = await this.svc.run(
      user.institute_id,
      await this.resolve(user, report),
      query,
    );
    return {
      report: result.report,
      columns: result.columns,
      total: result.total,
      data: result.rows,
      pagination:
        result.pagination ??
        buildMeta(result.total, 1, Math.max(1, result.total)),
    };
  }

  @Get(':report/export')
  @RequirePermission({ resource: 'reports', action: 'export' })
  @ApiOperation({ summary: 'Export a report as CSV (up to 10,000 rows)' })
  @ApiParam({ name: 'report', enum: REPORT_NAMES })
  async export(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('report') report: string,
    @Query() query: AlumniReportQueryDto,
    @Res() res: Response,
  ) {
    const name = await this.resolve(user, report);
    const result = await this.svc.run(user.institute_id, name, query, true);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="alumni-${name}.csv"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(toCsv(result.rows, result.columns));
  }
}
