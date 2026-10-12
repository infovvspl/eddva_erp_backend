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
  ParseBoolPipe,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffInstituteAdminViewOnlyGuard } from '../auth/staff-institute-admin-view-only.guard';
import { StaffPermissionsGuard } from '../auth/staff-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Leave Types')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffInstituteAdminViewOnlyGuard, StaffPermissionsGuard)
@Controller('api/staff/leave-types')
export class LeaveTypesController {
  constructor(private readonly svc: LeaveTypesService) {}

  @Post()
  @RequirePermission({ resource: 'leave_types', action: 'create' })
  @ApiOperation({ summary: 'Create a leave type' })
  create(@StaffUser() actor: StaffPlatformUser, @Body() dto: CreateLeaveTypeDto) {
    return this.svc.create(actor, dto);
  }

  @Get()
  @RequirePermission({ resource: 'leave_types', action: 'read' })
  @ApiOperation({ summary: 'List leave types' })
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  findAll(
    @StaffUser() actor: StaffPlatformUser,
    @Optional() @Query('include_inactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.svc.findAll(actor.institute_id, includeInactive ?? false);
  }

  @Get(':id')
  @RequirePermission({ resource: 'leave_types', action: 'read' })
  @ApiOperation({ summary: 'Get a leave type by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'leave_types', action: 'update' })
  @ApiOperation({ summary: 'Update a leave type' })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.svc.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'leave_types', action: 'delete' })
  @ApiOperation({ summary: 'Deactivate a leave type (soft delete; past balances are kept)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(@StaffUser() actor: StaffPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(actor, id);
  }
}
