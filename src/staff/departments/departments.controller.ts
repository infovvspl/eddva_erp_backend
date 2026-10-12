import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateStaffDepartmentDto } from './dto/create-department.dto';
import { UpdateStaffDepartmentDto } from './dto/update-department.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Departments')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/departments')
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}

  @Post()
  @RequirePermission({ resource: 'departments', action: 'create' })
  @ApiOperation({ summary: 'Create a staff department' })
  create(@StaffUser() actor: StaffPlatformUser, @Body() dto: CreateStaffDepartmentDto) {
    return this.svc.create(actor, dto);
  }

  @Get()
  @RequirePermission({ resource: 'departments', action: 'read' })
  @ApiOperation({ summary: 'List staff departments' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@StaffUser() actor: StaffPlatformUser, @Query('search') search?: string) {
    return this.svc.findAll(actor.institute_id, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'departments', action: 'read' })
  @ApiOperation({ summary: 'Get a department by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'departments', action: 'update' })
  @ApiOperation({ summary: 'Update a department' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDepartmentDto,
  ) {
    return this.svc.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'departments', action: 'delete' })
  @ApiOperation({ summary: 'Delete a department with no staff members' })
  @ApiParam({ name: 'id', example: 1 })
  remove(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(actor, id);
  }
}
