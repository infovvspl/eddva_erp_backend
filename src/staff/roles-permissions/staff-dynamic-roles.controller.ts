import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { StaffDynamicRolesService } from './staff-dynamic-roles.service';
import { CreateStaffDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateStaffDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignStaffUserToRoleDto } from './dto/assign-user.dto';
import { ResetStaffUserPasswordDto } from './dto/reset-password.dto';
import { StaffJwtGuard } from '../auth/staff-jwt.guard';
import { StaffUser } from '../auth/staff-user.decorator';
import type { StaffPlatformUser } from '../auth/staff-auth.service';

@ApiTags('Staff / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard)
@Controller('api/staff/roles')
export class StaffDynamicRolesController {
  constructor(private readonly svc: StaffDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({
    summary: 'Get the full Staff permission catalog (resources and actions)',
  })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({
    summary: 'Get the permission matrix of the currently authenticated user',
  })
  getMyPermissions(@StaffUser() actor: StaffPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({
    summary: 'Assign or re-assign a user to a role (Institute Admin only)',
  })
  assignUser(
    @StaffUser() actor: StaffPlatformUser,
    @Body() dto: AssignStaffUserToRoleDto,
  ) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({
    summary:
      'List all user-role assignments for this institute (Institute Admin only)',
  })
  listAssignments(@StaffUser() actor: StaffPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({
    summary: 'Reset login password for an assigned user (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  resetPassword(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetStaffUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({
    summary: 'Revoke a user role assignment (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  revokeAssignment(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom Staff role (Institute Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(
    @StaffUser() actor: StaffPlatformUser,
    @Body() dto: CreateStaffDynamicRoleDto,
  ) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all Staff roles for this institute (Institute Admin only)',
  })
  listRoles(@StaffUser() actor: StaffPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a role with its user assignments (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Staff role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a Staff role with no assigned users (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(
    @StaffUser() actor: StaffPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
