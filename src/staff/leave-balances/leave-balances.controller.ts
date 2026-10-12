import { Controller, Get, Post, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { LeaveBalancesService } from './leave-balances.service';
import { QueryLeaveBalanceDto } from './dto/query-leave-balance.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Leave Balances')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/leave-balances')
export class LeaveBalancesController {
  constructor(private readonly svc: LeaveBalancesService) {}

  @Get()
  @RequirePermission({ resource: 'leave_balances', action: 'read' })
  @ApiOperation({ summary: 'List leave balances for this institute (defaults to the current year)' })
  @ApiQuery({ name: 'staff_id', required: false })
  @ApiQuery({ name: 'year', required: false })
  findAll(@StaffUser() actor: StaffPlatformUser, @Query() query: QueryLeaveBalanceDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get('staff/:staffId')
  @RequirePermission({ resource: 'leave_balances', action: 'read' })
  @ApiOperation({ summary: "A staff member's leave balances (defaults to the current year)" })
  @ApiParam({ name: 'staffId', example: 1 })
  @ApiQuery({ name: 'year', required: false })
  findForStaff(
    @StaffUser() actor: StaffPlatformUser,
    @Param('staffId', ParseIntPipe) staffId: number,
    @Query('year') year?: string,
  ) {
    return this.svc.findForStaff(actor.institute_id, staffId, year ? Number(year) : undefined);
  }

  @Post('sync')
  @RequirePermission({ resource: 'leave_balances', action: 'sync' })
  @ApiOperation({
    summary:
      'Manually trigger the annual accrual for this institute (Institute Admin only). The daily scheduler does this automatically; use this to pull in a newly created leave type right away.',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Defaults to the current year' })
  sync(@StaffUser() actor: StaffPlatformUser, @Query('year') year?: string) {
    return this.svc
      .ensureBalancesForInstitute(actor.institute_id, year ? Number(year) : undefined)
      .then((count) => ({ rows_created: count }));
  }
}
