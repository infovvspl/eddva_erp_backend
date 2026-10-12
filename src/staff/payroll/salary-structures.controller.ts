import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SalaryStructuresService } from './salary-structures.service';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Payroll / Salary Structures')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/salary-structures')
export class SalaryStructuresController {
  constructor(private readonly svc: SalaryStructuresService) {}

  @Post()
  @RequirePermission({ resource: 'salary_structures', action: 'create' })
  @ApiOperation({ summary: "Set a staff member's salary structure (closes any currently open one)" })
  create(@StaffUser() actor: StaffPlatformUser, @Body() dto: CreateSalaryStructureDto) {
    return this.svc.create(actor, dto);
  }

  @Get('staff/:staffId')
  @RequirePermission({ resource: 'salary_structures', action: 'read' })
  @ApiOperation({ summary: "A staff member's salary structure history, newest first" })
  @ApiParam({ name: 'staffId', example: 1 })
  findForStaff(@StaffUser() actor: StaffPlatformUser, @Param('staffId', ParseIntPipe) staffId: number) {
    return this.svc.findForStaff(actor.institute_id, staffId);
  }
}
