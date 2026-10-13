import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { StaffMembersService } from './staff-members.service';
import { CreateStaffMemberDto } from './dto/create-staff-member.dto';
import { UpdateStaffMemberDto } from './dto/update-staff-member.dto';
import { QueryStaffMemberDto } from './dto/query-staff-member.dto';
import { RelieveStaffMemberDto, ReinstateStaffMemberDto } from './dto/relieve-staff-member.dto';
import { ImportLmsTeacherDto } from './dto/import-lms-teacher.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Directory')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/members')
export class StaffMembersController {
  constructor(private readonly svc: StaffMembersService) {}

  @Post()
  @RequirePermission({ resource: 'staff_members', action: 'create' })
  @ApiOperation({ summary: 'Add a staff member (teaching or non-teaching) to the directory' })
  create(@StaffUser() actor: StaffPlatformUser, @Body() dto: CreateStaffMemberDto) {
    return this.svc.create(actor, dto);
  }

  @Post('import-from-lms')
  @RequirePermission({ resource: 'staff_members', action: 'create' })
  @ApiOperation({ summary: 'Import an existing LMS teacher (no ERP record yet) as a staff member' })
  importFromLms(@StaffUser() actor: StaffPlatformUser, @Body() dto: ImportLmsTeacherDto) {
    return this.svc.importFromLms(actor, dto);
  }

  @Get()
  @RequirePermission({ resource: 'staff_members', action: 'read' })
  @ApiOperation({ summary: 'List staff members, filterable by type/status/department' })
  findAll(@StaffUser() actor: StaffPlatformUser, @Query() query: QueryStaffMemberDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'staff_members', action: 'read' })
  @ApiOperation({ summary: 'Get a staff member by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'staff_members', action: 'update' })
  @ApiOperation({ summary: 'Update a staff member' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffMemberDto,
  ) {
    return this.svc.update(actor, id, dto);
  }

  @Patch(':id/relieve')
  @RequirePermission({ resource: 'staff_members', action: 'relieve' })
  @ApiOperation({ summary: 'Relieve a staff member (resignation/termination)' })
  @ApiParam({ name: 'id', example: 1 })
  relieve(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RelieveStaffMemberDto,
  ) {
    return this.svc.relieve(actor, id, dto);
  }

  @Patch(':id/reinstate')
  @RequirePermission({ resource: 'staff_members', action: 'reinstate' })
  @ApiOperation({ summary: 'Reinstate a previously relieved staff member' })
  @ApiParam({ name: 'id', example: 1 })
  reinstate(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReinstateStaffMemberDto,
  ) {
    return this.svc.reinstate(actor, id, dto);
  }
}
