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
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import {
  RequirePermission,
  RequirePermissions,
} from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import {
  AdmissionReportQueryDto,
  REPORT_NAMES,
  ReportName,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Admission / Reports')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('funnel')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Funnel conversion (enquiries → applications → assessed → shortlisted → offers → accepted → fee paid → confirmed) by program and enquiry source',
  })
  funnel(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: AdmissionReportQueryDto,
  ) {
    return this.svc.funnel(user.institute_id, query);
  }

  @Get('seats')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Seat status per program and session: total, offered, accepted, confirmed, available',
  })
  seats(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: AdmissionReportQueryDto,
  ) {
    return this.svc.seats(user.institute_id, query);
  }

  @Get('offers')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Offers issued / accepted / declined / expired, by program and session',
  })
  offers(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: AdmissionReportQueryDto,
  ) {
    return this.svc.offers(user.institute_id, query);
  }

  @Get('documents')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Document verification: pending / verified / rejected by type, applications with open documents, average turnaround',
  })
  documents(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: AdmissionReportQueryDto,
  ) {
    return this.svc.documents(user.institute_id, query);
  }

  @Get('admissions')
  @RequirePermission({ resource: 'reports', action: 'read' })
  @ApiOperation({
    summary:
      'Confirmed admissions with enrollment number, applicant, program and session (paginated)',
  })
  admissions(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: AdmissionReportQueryDto,
  ) {
    return this.svc.admissions(user.institute_id, query);
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
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('report') report: string,
    @Query() query: AdmissionReportQueryDto,
    @Res() res: Response,
  ) {
    if (!(REPORT_NAMES as readonly string[]).includes(report)) {
      throw new BadRequestException(
        `Unknown report "${report}". Use one of: ${REPORT_NAMES.join(', ')}`,
      );
    }
    const csv = await this.svc.exportCsv(
      user.institute_id,
      report as ReportName,
      query,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="admission-${report}-report.csv"`,
    );
    res.send(csv);
  }
}
