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
import { SportsDynamicRolesService } from './sports-dynamic-roles.service';
import { CreateSportsDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateSportsDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignSportsUserToRoleDto } from './dto/assign-user.dto';
import { ResetSportsUserPasswordDto } from './dto/reset-password.dto';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsUser } from '../auth/sports-user.decorator';
import type { SportsPlatformUser } from '../auth/sports-auth.service';

@ApiTags('Sports / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard)
@Controller('sports/roles')
export class SportsDynamicRolesController {
  constructor(private readonly svc: SportsDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'Get full sports permission catalog (resources and available actions)' })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Get permissions matrix of the currently authenticated Sports user' })
  getMyPermissions(@SportsUser() actor: SportsPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({ summary: 'Assign or re-assign a user to a dynamic sports role (Institute Admin only)' })
  assignUser(@SportsUser() actor: SportsPlatformUser, @Body() dto: AssignSportsUserToRoleDto) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({ summary: 'List all user-role assignments for this institute' })
  listAssignments(@SportsUser() actor: SportsPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({ summary: 'Reset login password for an assigned sports user (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id / user_role_assignment_id (e.g. 1)' })
  resetPassword(
    @SportsUser() actor: SportsPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetSportsUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({ summary: 'Revoke a user sports role assignment (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id / user_role_assignment_id (e.g. 1)' })
  revokeAssignment(
    @SportsUser() actor: SportsPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom dynamic sports role (Institute Admin only)' })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(@SportsUser() actor: SportsPlatformUser, @Body() dto: CreateSportsDynamicRoleDto) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom sports roles for this institute' })
  listRoles(@SportsUser() actor: SportsPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dynamic sports role with user assignments' })
  @ApiParam({ name: 'id', description: 'role_id of the Dynamic Sports Role (e.g. 1)' })
  getRole(
    @SportsUser() actor: SportsPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dynamic sports role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id of the Dynamic Sports Role to update (e.g. 1)' })
  updateRole(
    @SportsUser() actor: SportsPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSportsDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dynamic sports role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id of the Dynamic Sports Role to delete (e.g. 1)' })
  deleteRole(
    @SportsUser() actor: SportsPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
