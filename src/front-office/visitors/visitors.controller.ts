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
import { VisitorsService } from './visitors.service';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';

@ApiTags('Front Office / Visitors')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/visitors')
export class VisitorsController {
  constructor(
    private readonly visitorsService: VisitorsService,
    private readonly auditService: FrontOfficeAuditService,
    private readonly access: FrontOfficeAccessService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'visitors', action: 'create' })
  @ApiOperation({ summary: 'Create a visitor master record' })
  async create(@Body() dto: CreateVisitorDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    const canViewSensitive = await this.access.hasPermission(user, 'visitors', 'sensitive_view');
    return this.visitorsService.create(dto, user.eddva_user_id, canViewSensitive);
  }

  @Get()
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'List/search visitors by name, phone, email, or organization' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@FrontOfficeUser() user: FrontOfficePlatformUser, @Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const canViewSensitive = await this.access.hasPermission(user, 'visitors', 'sensitive_view');
    return this.visitorsService.findAll(
      { search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined },
      canViewSensitive,
      user.eddva_user_id,
    );
  }

  @Get(':id')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Get a visitor master record' })
  @ApiParam({ name: 'id', example: 1 })
  async findOne(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    const canViewSensitive = await this.access.hasPermission(user, 'visitors', 'sensitive_view');
    return this.visitorsService.findOne(id, canViewSensitive, user.eddva_user_id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'visitors', action: 'update' })
  @ApiOperation({ summary: 'Update a visitor master record' })
  @ApiParam({ name: 'id', example: 1 })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVisitorDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    const canViewSensitive = await this.access.hasPermission(user, 'visitors', 'sensitive_view');
    return this.visitorsService.update(id, dto, user.eddva_user_id, canViewSensitive);
  }

  @Get(':id/visits')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Get a visitor visit (visitor_log) history' })
  @ApiParam({ name: 'id', example: 1 })
  getVisits(@Param('id', ParseIntPipe) id: number) {
    return this.visitorsService.getVisits(id);
  }

  @Get(':id/appointments')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Get a visitor appointment history' })
  @ApiParam({ name: 'id', example: 1 })
  getAppointmentHistory(@Param('id', ParseIntPipe) id: number) {
    return this.visitorsService.getAppointmentHistory(id);
  }

  @Get(':id/audit')
  @RequirePermission({ resource: 'visitors', action: 'read' })
  @ApiOperation({ summary: 'Get audit trail for a visitor record' })
  @ApiParam({ name: 'id', example: 1 })
  getAudit(@Param('id', ParseIntPipe) id: number) {
    return this.auditService.getLogsForEntity(FO_ENTITY.VISITOR, String(id));
  }
}
