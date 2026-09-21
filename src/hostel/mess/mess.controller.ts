import {
  Body,
  Controller,
  Delete,
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
import { HostelDayOfWeek } from '@prisma/client';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { BadRequestException } from '@nestjs/common';
import { MessMenuService } from './mess-menu.service';
import { MessAttendanceService } from './mess-attendance.service';
import {
  BulkMealAttendanceDto,
  CreateMessMenuDto,
  MarkMealAttendanceDto,
  MessMenuDateQueryDto,
  QueryMealAttendanceDto,
  QueryMessMenuDto,
  UpdateMealAttendanceDto,
  UpdateMessMenuDto,
} from './dto/mess.dto';

@ApiTags('Hostel / Mess Menu')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/mess/menu')
export class MessMenuController {
  constructor(private readonly svc: MessMenuService) {}

  @Post()
  @RequirePermission({ resource: 'mess_menu', action: 'create' })
  @ApiOperation({
    summary: 'Create a menu for a day of week + meal, effective from a date',
  })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateMessMenuDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'mess_menu', action: 'read' })
  @ApiOperation({ summary: 'List menu records (day, meal, active)' })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryMessMenuDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('weekly')
  @RequirePermission({ resource: 'mess_menu', action: 'read' })
  @ApiOperation({
    summary: 'The full week (Mon–Sun × 4 meals) in force on a date',
  })
  weekly(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: MessMenuDateQueryDto,
  ) {
    return this.svc.weekly(user.institute_id, query.date);
  }

  @Get('day/:day')
  @RequirePermission({ resource: 'mess_menu', action: 'read' })
  @ApiOperation({
    summary: 'The four meals for one day of the week, as in force on a date',
  })
  @ApiParam({ name: 'day', enum: Object.values(HostelDayOfWeek) })
  byDay(
    @HostelUser() user: HostelPlatformUser,
    @Param('day') day: string,
    @Query() query: MessMenuDateQueryDto,
  ) {
    if (!(Object.values(HostelDayOfWeek) as string[]).includes(day)) {
      throw new BadRequestException(
        `day must be one of ${Object.values(HostelDayOfWeek).join(', ')}`,
      );
    }
    return this.svc.forDay(
      user.institute_id,
      day as HostelDayOfWeek,
      query.date,
    );
  }

  @Get(':id')
  @RequirePermission({ resource: 'mess_menu', action: 'read' })
  @ApiOperation({ summary: 'Get a menu record' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'mess_menu', action: 'update' })
  @ApiOperation({ summary: 'Update items / effective date / active flag' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMessMenuDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'mess_menu', action: 'delete' })
  @ApiOperation({ summary: 'Deactivate a menu (kept for history)' })
  @ApiParam({ name: 'id', example: 1 })
  deactivate(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deactivate(user, id);
  }
}

@ApiTags('Hostel / Mess Attendance')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/mess/attendance')
export class MessAttendanceController {
  constructor(private readonly svc: MessAttendanceService) {}

  @Post()
  @RequirePermission({ resource: 'mess_attendance', action: 'mark' })
  @ApiOperation({
    summary:
      'Record opted_in / opted_out / consumed / missed for one resident, date and meal (duplicates → 409)',
  })
  mark(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: MarkMealAttendanceDto,
  ) {
    return this.svc.mark(user, dto);
  }

  @Post('bulk')
  @RequirePermission({ resource: 'mess_attendance', action: 'mark' })
  @ApiOperation({ summary: 'Record a whole meal at once — all-or-nothing' })
  bulk(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: BulkMealAttendanceDto,
  ) {
    return this.svc.bulk(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'mess_attendance', action: 'read' })
  @ApiOperation({
    summary:
      'Daily meal attendance — filter by date/range, meal, status, resident, block',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryMealAttendanceDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('summary')
  @RequirePermission({ resource: 'mess_attendance', action: 'read' })
  @ApiOperation({
    summary:
      'Meal consumption summary per meal: opted in/out, consumed, missed, expected meals, consumption rate',
  })
  summary(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryMealAttendanceDto,
  ) {
    return this.svc.summary(user.institute_id, query);
  }

  @Get('resident/:residentId')
  @RequirePermission({ resource: 'mess_attendance', action: 'read' })
  @ApiOperation({ summary: 'Meal history of one resident' })
  @ApiParam({ name: 'residentId', example: 1 })
  residentHistory(
    @HostelUser() user: HostelPlatformUser,
    @Param('residentId', ParseIntPipe) residentId: number,
    @Query() query: QueryMealAttendanceDto,
  ) {
    return this.svc.residentHistory(user.institute_id, residentId, query);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'mess_attendance', action: 'update' })
  @ApiOperation({ summary: 'Change a meal record status (audited)' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMealAttendanceDto,
  ) {
    return this.svc.update(user, id, dto);
  }
}
