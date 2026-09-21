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
import { HostelDynamicRolesService } from './hostel-dynamic-roles.service';
import { CreateHostelDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateHostelDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignHostelUserToRoleDto } from './dto/assign-user.dto';
import { ResetHostelUserPasswordDto } from './dto/reset-password.dto';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';

@ApiTags('Hostel / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(HostelJwtGuard)
@Controller('api/hostel/roles')
export class HostelDynamicRolesController {
  constructor(private readonly svc: HostelDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({
    summary: 'Get the full Hostel permission catalog (resources and actions)',
  })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({
    summary: 'Get the permission matrix of the currently authenticated user',
  })
  getMyPermissions(@HostelUser() actor: HostelPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({
    summary: 'Assign or re-assign a user to a role (Institute Admin only)',
  })
  assignUser(
    @HostelUser() actor: HostelPlatformUser,
    @Body() dto: AssignHostelUserToRoleDto,
  ) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({
    summary:
      'List all user-role assignments for this institute (Institute Admin only)',
  })
  listAssignments(@HostelUser() actor: HostelPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({
    summary: 'Reset login password for an assigned user (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  resetPassword(
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetHostelUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({
    summary: 'Revoke a user role assignment (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  revokeAssignment(
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom Hostel role (Institute Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(
    @HostelUser() actor: HostelPlatformUser,
    @Body() dto: CreateHostelDynamicRoleDto,
  ) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all Hostel roles for this institute (Institute Admin only)',
  })
  listRoles(@HostelUser() actor: HostelPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a role with its user assignments (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Hostel role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a Hostel role with no assigned users (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(
    @HostelUser() actor: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
