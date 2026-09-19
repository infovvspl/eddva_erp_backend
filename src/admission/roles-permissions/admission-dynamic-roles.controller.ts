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
import { AdmissionDynamicRolesService } from './admission-dynamic-roles.service';
import { CreateAdmissionDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateAdmissionDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignAdmissionUserToRoleDto } from './dto/assign-user.dto';
import { ResetAdmissionUserPasswordDto } from './dto/reset-password.dto';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';

@ApiTags('Admission / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(AdmissionJwtGuard)
@Controller('api/admission/roles')
export class AdmissionDynamicRolesController {
  constructor(private readonly svc: AdmissionDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({
    summary:
      'Get the full Admission permission catalog (resources and actions)',
  })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({
    summary: 'Get the permission matrix of the currently authenticated user',
  })
  getMyPermissions(@AdmissionUser() actor: AdmissionPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({
    summary: 'Assign or re-assign a user to a role (Institute Admin only)',
  })
  assignUser(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Body() dto: AssignAdmissionUserToRoleDto,
  ) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({
    summary:
      'List all user-role assignments for this institute (Institute Admin only)',
  })
  listAssignments(@AdmissionUser() actor: AdmissionPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({
    summary: 'Reset login password for an assigned user (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  resetPassword(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetAdmissionUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({
    summary: 'Revoke a user role assignment (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment id (e.g. 1)' })
  revokeAssignment(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom Admission role (Institute Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Body() dto: CreateAdmissionDynamicRoleDto,
  ) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List all Admission roles for this institute (Institute Admin only)',
  })
  listRoles(@AdmissionUser() actor: AdmissionPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a role with its user assignments (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an Admission role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete an Admission role with no assigned users (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(
    @AdmissionUser() actor: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
