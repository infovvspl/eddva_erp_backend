import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { IssuesService } from './issues.service';
import { ApprovalRulesService } from './approval-rules.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { RejectIssueDto } from './dto/reject-issue.dto';
import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';

@ApiTags('Inventory / Issues & Returns')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/issues')
export class IssuesController {
  constructor(
    private readonly issuesService: IssuesService,
    private readonly approvalRulesService: ApprovalRulesService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'issues', action: 'create' })
  @ApiOperation({ summary: 'Issue stock (consumable) or an asset unit to a holder — held for approval automatically if a matching approval rule is exceeded' })
  create(@Body() dto: CreateIssueDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.issuesService.create(dto, user.eddva_user_id);
  }

  @Get('approval-rules')
  @RequirePermission({ resource: 'issues', action: 'approve' })
  @ApiOperation({ summary: 'List configured approval rules (by category and/or value/quantity threshold)' })
  listApprovalRules() {
    return this.approvalRulesService.findAll();
  }

  @Post('approval-rules')
  @RequirePermission({ resource: 'issues', action: 'approve' })
  @ApiOperation({ summary: 'Create an approval rule — omit category_id for a global rule' })
  createApprovalRule(@Body() dto: CreateApprovalRuleDto) {
    return this.approvalRulesService.create(dto);
  }

  @Get()
  @RequirePermission({ resource: 'issues', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter issues' })
  @ApiQuery({ name: 'item_id', required: false })
  @ApiQuery({ name: 'holder_id', required: false })
  @ApiQuery({ name: 'location_id', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'approval_status', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('item_id') itemId?: string,
    @Query('holder_id') holderId?: string,
    @Query('location_id') locationId?: string,
    @Query('status') status?: string,
    @Query('approval_status') approvalStatus?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.issuesService.findAll({
      item_id: itemId ? Number(itemId) : undefined,
      holder_id: holderId ? Number(holderId) : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      status,
      approval_status: approvalStatus,
      date_from: dateFrom,
      date_to: dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission({ resource: 'issues', action: 'read' })
  @ApiOperation({ summary: 'Get issue details including its return history' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.issuesService.findOne(id);
  }

  @Post(':id/approve')
  @RequirePermission({ resource: 'issues', action: 'approve' })
  @ApiOperation({ summary: 'Approve a pending-approval issue — stock only leaves the store at this point, not at creation' })
  @ApiParam({ name: 'id', example: 1 })
  approve(@Param('id', ParseIntPipe) id: number, @InventoryUser() user: InventoryPlatformUser) {
    return this.issuesService.approve(id, user.eddva_user_id);
  }

  @Post(':id/reject')
  @RequirePermission({ resource: 'issues', action: 'approve' })
  @ApiOperation({ summary: 'Reject a pending-approval issue — no stock ever moves' })
  @ApiParam({ name: 'id', example: 1 })
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectIssueDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.issuesService.reject(id, dto, user.eddva_user_id);
  }

  @Post(':id/return')
  @RequirePermission({ resource: 'issues', action: 'return' })
  @ApiOperation({ summary: 'Return an issue — full or partial for consumables, full unit for assets' })
  @ApiParam({ name: 'id', example: 1 })
  returnIssue(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateReturnDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.issuesService.returnIssue(id, dto, user.eddva_user_id);
  }
}
