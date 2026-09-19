import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { InterviewsService } from './interviews.service';
import {
  EvaluateInterviewDto,
  QueryInterviewDto,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
  UpdateInterviewStatusDto,
} from './dto/interview.dto';

@ApiTags('Admission / Interviews')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/interviews')
export class InterviewsController {
  constructor(private readonly svc: InterviewsService) {}

  @Post()
  @RequirePermission({ resource: 'interviews', action: 'schedule' })
  @ApiOperation({
    summary:
      'Schedule an interview for an application (optional stage; one interview per application)',
  })
  schedule(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.svc.schedule(user, dto);
  }

  // GET routes are authorised inside the service: `read` sees all interviews,
  // `read_assigned` sees only interviews the user is a panelist on.
  @Get()
  @ApiOperation({
    summary:
      'List interviews. Requires interviews:read (all) or interviews:read_assigned (own panel only)',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryInterviewDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get an interview with panel and evaluations (assigned-only users see just their own evaluation)',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'interviews', action: 'reschedule' })
  @ApiOperation({
    summary:
      'Reschedule an interview (sets status to rescheduled; can replace the panel)',
  })
  @ApiParam({ name: 'id', example: 1 })
  reschedule(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleInterviewDto,
  ) {
    return this.svc.reschedule(user, id, dto);
  }

  @Post(':id/status')
  @RequirePermission({ resource: 'interviews', action: 'schedule' })
  @ApiOperation({ summary: 'Mark an interview completed or no_show' })
  @ApiParam({ name: 'id', example: 1 })
  setStatus(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInterviewStatusDto,
  ) {
    return this.svc.setStatus(user, id, dto);
  }

  @Post(':id/evaluate')
  @RequirePermission({ resource: 'interviews', action: 'evaluate' })
  @ApiOperation({
    summary:
      'Submit an evaluation (score, remarks, recommendation). Panel members only when a panel is assigned; one per evaluator',
  })
  @ApiParam({ name: 'id', example: 1 })
  evaluate(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluateInterviewDto,
  ) {
    return this.svc.evaluate(user, id, dto);
  }
}
