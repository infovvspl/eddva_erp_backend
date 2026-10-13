import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FeeReportsService } from './fee-reports.service';
import { ClassWiseReportQueryDto } from './dto/report-query.dto';
import { StudentFeesJwtGuard } from '../auth/student-fees-jwt.guard';
import { FeeUser } from '../auth/student-fees-user.decorator';
import type { FeePlatformUser } from '../auth/student-fees-auth.service';

@ApiTags('Student Fees / Reports')
@ApiBearerAuth()
@UseGuards(StudentFeesJwtGuard)
@Controller('api/student-fees/reports')
export class FeeReportsController {
  constructor(private readonly svc: FeeReportsService) {}

  @Get('class-wise')
  @ApiOperation({ summary: 'Fee collection broken down by class for one academic year' })
  classWise(@FeeUser() actor: FeePlatformUser, @Query() query: ClassWiseReportQueryDto) {
    return this.svc.classWise(actor.institute_id, query.academic_year);
  }
}
