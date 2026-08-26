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
import { LibDynamicRolesService } from './lib-dynamic-roles.service';
import { CreateDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignUserToRoleDto } from './dto/assign-user.dto';
import { ResetUserPasswordDto } from './dto/reset-password.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(LibJwtGuard)
@Controller('api/library/roles')
export class LibDynamicRolesController {
  constructor(private readonly svc: LibDynamicRolesService) {}

  // ─── Permission Catalog ────────────────────────────────────────────────────

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'Get full permission catalog (all available permission keys grouped by area)' })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Get permissions of the currently authenticated Library Platform user' })
  getMyPermissions(@LibUser() actor: LibPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  // ─── User Assignments (Static sub-routes placed before :id parameter) ──────

  @Post('user-assignments')
  @ApiOperation({ summary: 'Assign or re-assign a user to a dynamic role (Institute Admin only)' })
  assignUser(@LibUser() actor: LibPlatformUser, @Body() dto: AssignUserToRoleDto) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({ summary: 'List all user-role assignments for this institute' })
  listAssignments(@LibUser() actor: LibPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({ summary: 'Reset login password for an assigned user (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id / user_role_assignment_id (e.g. 1)' })
  resetPassword(
    @LibUser() actor: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({ summary: 'Revoke a user library role assignment (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id / user_role_assignment_id (e.g. 1)' })
  revokeAssignment(
    @LibUser() actor: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  // ─── Dynamic Roles CRUD ───────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a custom dynamic role (Institute Admin only)' })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(@LibUser() actor: LibPlatformUser, @Body() dto: CreateDynamicRoleDto) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom roles for this institute' })
  listRoles(@LibUser() actor: LibPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dynamic role with its user assignments' })
  @ApiParam({ name: 'id', description: 'role_id of the Dynamic Library Role (e.g. 1)' })
  getRole(
    @LibUser() actor: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dynamic role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id of the Dynamic Library Role to update (e.g. 1)' })
  updateRole(
    @LibUser() actor: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dynamic role and all its user assignments (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id of the Dynamic Library Role to delete (e.g. 1)' })
  deleteRole(
    @LibUser() actor: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
