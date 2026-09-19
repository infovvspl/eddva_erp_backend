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
import { CanteenDynamicRolesService } from './canteen-dynamic-roles.service';
import { CreateCanteenDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateCanteenDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignCanteenUserToRoleDto } from './dto/assign-user.dto';
import { ResetCanteenUserPasswordDto } from './dto/reset-password.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';

@ApiTags('Canteen / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard)
@Controller('api/canteen/roles')
export class CanteenDynamicRolesController {
  constructor(private readonly svc: CanteenDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({
    summary:
      'Get full Canteen permission catalog (resources and available actions)',
  })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({
    summary:
      'Get permissions matrix of the currently authenticated Canteen user',
  })
  getMyPermissions(@CanteenUser() actor: CanteenPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({
    summary:
      'Assign or re-assign a user to a dynamic Canteen role (Institute Admin only)',
  })
  assignUser(
    @CanteenUser() actor: CanteenPlatformUser,
    @Body() dto: AssignCanteenUserToRoleDto,
  ) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({
    summary:
      'List all user-role assignments for this institute (Institute Admin only)',
  })
  listAssignments(@CanteenUser() actor: CanteenPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({
    summary:
      'Reset login password for an assigned Canteen user (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  resetPassword(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetCanteenUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({
    summary: 'Revoke a user Canteen role assignment (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  revokeAssignment(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom dynamic Canteen role (Institute Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(
    @CanteenUser() actor: CanteenPlatformUser,
    @Body() dto: CreateCanteenDynamicRoleDto,
  ) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List all custom Canteen roles for this institute (Institute Admin only)',
  })
  listRoles(@CanteenUser() actor: CanteenPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a specific dynamic Canteen role with user assignments (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a dynamic Canteen role (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCanteenDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a dynamic Canteen role (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(
    @CanteenUser() actor: CanteenPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
