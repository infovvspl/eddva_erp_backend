import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { FrontOfficeAccessService } from '../common/front-office-access.service';
import { EnquiriesService } from './enquiries.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { AssignEnquiryDto } from './dto/assign-enquiry.dto';
import { ChangeEnquiryStatusDto } from './dto/change-enquiry-status.dto';
import { CreateFollowupDto } from './dto/create-followup.dto';

@ApiTags('Front Office / Enquiries')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/enquiries')
export class EnquiriesController {
  constructor(
    private readonly enquiriesService: EnquiriesService,
    private readonly access: FrontOfficeAccessService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'enquiries', action: 'create' })
  @ApiOperation({ summary: 'Create an enquiry' })
  create(@Body() dto: CreateEnquiryDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.enquiriesService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter enquiries' })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'assigned_to', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'created_from', required: false })
  @ApiQuery({ name: 'created_to', required: false })
  @ApiQuery({ name: 'sort', required: false, example: 'created_at:desc' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @FrontOfficeUser() user: FrontOfficePlatformUser,
    @Query('source') source?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('assigned_to') assignedTo?: string,
    @Query('search') search?: string,
    @Query('created_from') createdFrom?: string,
    @Query('created_to') createdTo?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = await this.access.resolveScope(user);
    return this.enquiriesService.findAll(
      {
        source,
        category,
        status,
        assigned_to: assignedTo ? Number(assignedTo) : undefined,
        search,
        created_from: createdFrom,
        created_to: createdTo,
        sort,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
      this.access.assignedScopedWhere(scope),
    );
  }

  @Get('followups/upcoming')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'Follow-ups due in the next N days (default 7)' })
  @ApiQuery({ name: 'days', required: false })
  upcomingFollowups(@Query('days') days?: string) {
    return this.enquiriesService.upcomingFollowups(days ? Number(days) : undefined);
  }

  @Get('followups/overdue')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'Follow-ups past their next_followup_date on non-closed enquiries' })
  overdueFollowups() {
    return this.enquiriesService.overdueFollowups();
  }

  @Get(':id')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'Get enquiry details' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.enquiriesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'enquiries', action: 'update' })
  @ApiOperation({ summary: 'Update enquiry details' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEnquiryDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.enquiriesService.update(id, dto, user.eddva_user_id);
  }

  @Patch(':id/assign')
  @RequirePermission({ resource: 'enquiries', action: 'assign' })
  @ApiOperation({ summary: 'Assign/reassign an enquiry' })
  @ApiParam({ name: 'id', example: 1 })
  assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignEnquiryDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.enquiriesService.assign(id, dto, user.eddva_user_id);
  }

  @Patch(':id/status')
  @RequirePermission({ resource: 'enquiries', action: 'update' })
  @ApiOperation({ summary: 'Change enquiry status (open → in_progress → closed)' })
  @ApiParam({ name: 'id', example: 1 })
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeEnquiryStatusDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.enquiriesService.changeStatus(id, dto, user.eddva_user_id);
  }

  @Post(':id/followups')
  @RequirePermission({ resource: 'enquiries', action: 'followup' })
  @ApiOperation({ summary: 'Create a follow-up (auto-moves an open enquiry to in_progress)' })
  @ApiParam({ name: 'id', example: 1 })
  createFollowup(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateFollowupDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.enquiriesService.createFollowup(id, dto, user.eddva_user_id);
  }

  @Get(':id/followups')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'List follow-ups for an enquiry' })
  @ApiParam({ name: 'id', example: 1 })
  listFollowups(@Param('id', ParseIntPipe) id: number) {
    return this.enquiriesService.listFollowups(id);
  }

  @Get(':id/history')
  @RequirePermission({ resource: 'enquiries', action: 'read' })
  @ApiOperation({ summary: 'Get enquiry audit history' })
  @ApiParam({ name: 'id', example: 1 })
  history(@Param('id', ParseIntPipe) id: number) {
    return this.enquiriesService.history(id);
  }
}
