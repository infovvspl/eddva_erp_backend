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
import { TransportDynamicRolesService } from './transport-dynamic-roles.service';
import { CreateTransportDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateTransportDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignTransportUserToRoleDto } from './dto/assign-user.dto';
import { ResetTransportUserPasswordDto } from './dto/reset-password.dto';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';

@ApiTags('Transport / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard)
@Controller('api/transport/roles')
export class TransportDynamicRolesController {
  constructor(private readonly svc: TransportDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'Get full Transport permission catalog (resources and available actions)' })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Get permissions matrix of the currently authenticated Transport user' })
  getMyPermissions(@TransportUser() actor: TransportPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({ summary: 'Assign or re-assign a user to a dynamic Transport role (Institute Admin only)' })
  assignUser(@TransportUser() actor: TransportPlatformUser, @Body() dto: AssignTransportUserToRoleDto) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({ summary: 'List all user-role assignments for this institute' })
  listAssignments(@TransportUser() actor: TransportPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({ summary: 'Reset login password for an assigned Transport user (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  resetPassword(
    @TransportUser() actor: TransportPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetTransportUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({ summary: 'Revoke a user Transport role assignment (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  revokeAssignment(@TransportUser() actor: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom dynamic Transport role (Institute Admin only)' })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(@TransportUser() actor: TransportPlatformUser, @Body() dto: CreateTransportDynamicRoleDto) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom Transport roles for this institute' })
  listRoles(@TransportUser() actor: TransportPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dynamic Transport role with user assignments' })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(@TransportUser() actor: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dynamic Transport role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @TransportUser() actor: TransportPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransportDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dynamic Transport role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(@TransportUser() actor: TransportPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteRole(actor, id);
  }
}
