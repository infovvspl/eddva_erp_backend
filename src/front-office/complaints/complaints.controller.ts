import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { FrontOfficeAccessService } from '../common/front-office-access.service';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { AssignComplaintDto } from './dto/assign-complaint.dto';
import { ChangeComplaintPriorityDto } from './dto/change-priority.dto';
import { ChangeComplaintStatusDto } from './dto/change-complaint-status.dto';
import { CreateComplaintUpdateDto } from './dto/create-complaint-update.dto';
import { EscalateComplaintDto } from './dto/escalate-complaint.dto';

@ApiTags('Front Office / Complaints')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/complaints')
export class ComplaintsController {
  constructor(
    private readonly complaintsService: ComplaintsService,
    private readonly access: FrontOfficeAccessService,
    private readonly auditService: FrontOfficeAuditService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'complaints', action: 'create' })
  @ApiOperation({ summary: 'Register a complaint' })
  create(@Body() dto: CreateComplaintDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.create(user.institute_id, dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter complaints' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'assigned_to', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @FrontOfficeUser() user: FrontOfficePlatformUser,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('assigned_to') assignedTo?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = await this.access.resolveScope(user);
    return this.complaintsService.findAll(user.institute_id, 
      {
        category,
        priority,
        status,
        assigned_to: assignedTo ? Number(assignedTo) : undefined,
        date_from: dateFrom,
        date_to: dateTo,
        phone,
        email,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
      this.access.assignedScopedWhere(scope),
    );
  }

  @Get(':id')
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({ summary: 'Get complaint details' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@FrontOfficeUser() user: FrontOfficePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.complaintsService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Update complaint details' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateComplaintDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.update(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Patch(':id/assign')
  @RequirePermission({ resource: 'complaints', action: 'assign' })
  @ApiOperation({ summary: 'Assign/reassign a complaint' })
  @ApiParam({ name: 'id', example: 1 })
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignComplaintDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.assign(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Patch(':id/priority')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Change complaint priority' })
  @ApiParam({ name: 'id', example: 1 })
  changePriority(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeComplaintPriorityDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.changePriority(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Patch(':id/status')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Change complaint status (open → in_progress → resolved → closed, reopen supported)' })
  @ApiParam({ name: 'id', example: 1 })
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeComplaintStatusDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.changeStatus(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/resolve')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Mark complaint resolved' })
  @ApiParam({ name: 'id', example: 1 })
  resolve(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.resolve(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/close')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Close a complaint' })
  @ApiParam({ name: 'id', example: 1 })
  close(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.close(user.institute_id, id, user.eddva_user_id);
  }

  @Post(':id/escalate')
  @RequirePermission({ resource: 'complaints', action: 'escalate' })
  @ApiOperation({ summary: 'Escalate a complaint to a manager (raises priority to at least high)' })
  @ApiParam({ name: 'id', example: 1 })
  escalate(@Param('id', ParseIntPipe) id: number, @Body() dto: EscalateComplaintDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.escalate(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Post(':id/updates')
  @RequirePermission({ resource: 'complaints', action: 'update' })
  @ApiOperation({ summary: 'Add a complaint update/timeline entry' })
  @ApiParam({ name: 'id', example: 1 })
  addUpdate(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateComplaintUpdateDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.complaintsService.addUpdate(user.institute_id, id, dto, user.eddva_user_id);
  }

  @Get(':id/updates')
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({ summary: 'Get the full complaint update/timeline history' })
  @ApiParam({ name: 'id', example: 1 })
  listUpdates(@FrontOfficeUser() user: FrontOfficePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.complaintsService.listUpdates(user.institute_id, id);
  }

  @Get(':id/audit')
  @RequirePermission({ resource: 'complaints', action: 'read' })
  @ApiOperation({ summary: 'Get audit trail for a complaint' })
  @ApiParam({ name: 'id', example: 1 })
  getAudit(@Param('id', ParseIntPipe) id: number) {
    return this.auditService.getLogsForEntity(FO_ENTITY.COMPLAINT, String(id));
  }
}
