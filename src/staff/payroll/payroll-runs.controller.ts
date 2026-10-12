import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PayrollRunsService } from './payroll-runs.service';
import { GeneratePayrollRunDto } from './dto/generate-payroll-run.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Payroll / Runs')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/payroll-runs')
export class PayrollRunsController {
  constructor(private readonly svc: PayrollRunsService) {}

  @Post()
  @RequirePermission({ resource: 'payroll_runs', action: 'create' })
  @ApiOperation({
    summary: 'Generate a payroll run for a month — one payslip per active staff member with a salary structure',
  })
  generate(@StaffUser() actor: StaffPlatformUser, @Body() dto: GeneratePayrollRunDto) {
    return this.svc.generate(actor, dto);
  }

  @Get()
  @RequirePermission({ resource: 'payroll_runs', action: 'read' })
  @ApiOperation({ summary: 'List payroll runs, optionally filtered by year' })
  @ApiQuery({ name: 'year', required: false })
  findAll(@StaffUser() actor: StaffPlatformUser, @Query('year') year?: string) {
    return this.svc.findAll(actor.institute_id, year ? Number(year) : undefined);
  }

  @Get(':id')
  @RequirePermission({ resource: 'payroll_runs', action: 'read' })
  @ApiOperation({ summary: 'Get a payroll run with its payslips' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id/finalize')
  @RequirePermission({ resource: 'payroll_runs', action: 'finalize' })
  @ApiOperation({ summary: 'Finalize a draft payroll run (locks it for payment)' })
  @ApiParam({ name: 'id', example: 1 })
  finalize(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.finalize(actor, id);
  }

  @Patch(':id/pay')
  @RequirePermission({ resource: 'payroll_runs', action: 'pay' })
  @ApiOperation({ summary: 'Mark a finalized payroll run paid and post each payslip to the ledger' })
  @ApiParam({ name: 'id', example: 1 })
  markPaid(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.markPaid(actor, id);
  }
}
