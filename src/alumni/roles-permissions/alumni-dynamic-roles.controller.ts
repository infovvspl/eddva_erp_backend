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
import { AlumniDynamicRolesService } from './alumni-dynamic-roles.service';
import { CreateAlumniDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateAlumniDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignAlumniUserToRoleDto } from './dto/assign-user.dto';
import { ResetAlumniUserPasswordDto } from './dto/reset-password.dto';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';

@ApiTags('Alumni / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(AlumniJwtGuard)
@Controller('api/alumni/roles')
export class AlumniDynamicRolesController {
  constructor(private readonly svc: AlumniDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({
    summary: 'Get the full Alumni permission catalog (resources and actions)',
  })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({
    summary: 'Get the permission matrix of the currently authenticated user',
  })
  getMyPermissions(@AlumniUser() actor: AlumniPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({
    summary: 'Assign or re-assign a user to a role (Institute Admin only)',
  })
  assignUser(
    @AlumniUser() actor: AlumniPlatformUser,
    @Body() dto: AssignAlumniUserToRoleDto,
  ) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({
    summary:
      'List all user-role assignments for this institute (Institute Admin only)',
  })
  listAssignments(@AlumniUser() actor: AlumniPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({
    summary: 'Reset login password for an assigned user (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  resetPassword(
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetAlumniUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({
    summary: 'Revoke a user role assignment (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  revokeAssignment(
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom Alumni role (Institute Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(
    @AlumniUser() actor: AlumniPlatformUser,
    @Body() dto: CreateAlumniDynamicRoleDto,
  ) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all Alumni roles for this institute (Institute Admin only)',
  })
  listRoles(@AlumniUser() actor: AlumniPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a role with its user assignments (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Alumni role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAlumniDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a Alumni role with no assigned users (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(
    @AlumniUser() actor: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
