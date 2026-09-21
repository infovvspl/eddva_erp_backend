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
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { ComplaintsService } from './complaints.service';
import {
  AssignHostelComplaintDto,
  ChangeHostelComplaintStatusDto,
  CloseHostelComplaintDto,
  CreateHostelComplaintDto,
  CreateHostelComplaintUpdateDto,
  QueryHostelComplaintDto,
  ResolveHostelComplaintDto,
  UpdateHostelComplaintDto,
} from './dto/complaint.dto';

@ApiTags('Hostel / Complaints & Maintenance')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/complaints')
export class ComplaintsController {
  constructor(private readonly svc: ComplaintsService) {}

  @Post()
  @RequirePermission({ resource: 'complaints', action: 'create' })
  @ApiOperation({
    summary: 'Register a hostel complaint (resident and/or room)',
  })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateHostelComplaintDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({
    summary:
      'List complaints — status, priority, category, assignee, resident, room, block, date range; most urgent first',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelComplaintDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({ summary: 'Get a complaint with its update timeline' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({
    summary: 'Edit category/description/priority (not once closed)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelComplaintDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/assign')
  @RequirePermission({ resource: 'complaints', action: 'assign' })
  @ApiOperation({
    summary: 'Assign / reassign to an active hostel staff member',
  })
  @ApiParam({ name: 'id', example: 1 })
  assign(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignHostelComplaintDto,
  ) {
    return this.svc.assign(user, id, dto);
  }

  @Post(':id/status')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({
    summary:
      'Change status: open → in_progress → resolved → closed (resolved may be re-opened to in_progress). Use /resolve and /close for those two',
  })
  @ApiParam({ name: 'id', example: 1 })
  changeStatus(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeHostelComplaintStatusDto,
  ) {
    return this.svc.changeStatus(user, id, dto.status, dto.notes);
  }

  @Post(':id/resolve')
  @RequirePermission({ resource: 'complaints', action: 'resolve' })
  @ApiOperation({
    summary: 'Resolve (resolution notes required, stamps resolved_at)',
  })
  @ApiParam({ name: 'id', example: 1 })
  resolve(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveHostelComplaintDto,
  ) {
    return this.svc.resolve(user, id, dto.resolution_notes);
  }

  @Post(':id/close')
  @RequirePermission({ resource: 'complaints', action: 'close' })
  @ApiOperation({ summary: 'Close a complaint (final)' })
  @ApiParam({ name: 'id', example: 1 })
  close(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseHostelComplaintDto,
  ) {
    return this.svc.close(user, id, dto.notes);
  }

  @Post(':id/updates')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Add a note to the complaint timeline' })
  @ApiParam({ name: 'id', example: 1 })
  addUpdate(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateHostelComplaintUpdateDto,
  ) {
    return this.svc.addUpdate(user, id, dto);
  }

  @Get(':id/updates')
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({
    summary:
      'Full timeline: notes, assignments and status changes (newest first)',
  })
  @ApiParam({ name: 'id', example: 1 })
  listUpdates(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.listUpdates(user.institute_id, id);
  }

  @Get(':id/history')
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({
    summary: 'Status / assignment / priority changes only, oldest first',
  })
  @ApiParam({ name: 'id', example: 1 })
  history(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.history(user.institute_id, id);
  }
}
