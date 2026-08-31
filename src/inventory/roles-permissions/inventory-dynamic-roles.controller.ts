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
import { InventoryDynamicRolesService } from './inventory-dynamic-roles.service';
import { CreateInventoryDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateInventoryDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignInventoryUserToRoleDto } from './dto/assign-user.dto';
import { ResetInventoryUserPasswordDto } from './dto/reset-password.dto';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';

@ApiTags('Inventory / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard)
@Controller('api/inventory/roles')
export class InventoryDynamicRolesController {
  constructor(private readonly svc: InventoryDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'Get full Inventory permission catalog (resources and available actions)' })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Get permissions matrix of the currently authenticated Inventory user' })
  getMyPermissions(@InventoryUser() actor: InventoryPlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({ summary: 'Assign or re-assign a user to a dynamic Inventory role (Institute Admin only)' })
  assignUser(@InventoryUser() actor: InventoryPlatformUser, @Body() dto: AssignInventoryUserToRoleDto) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({ summary: 'List all user-role assignments for this institute' })
  listAssignments(@InventoryUser() actor: InventoryPlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({ summary: 'Reset login password for an assigned Inventory user (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  resetPassword(
    @InventoryUser() actor: InventoryPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetInventoryUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({ summary: 'Revoke a user Inventory role assignment (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  revokeAssignment(@InventoryUser() actor: InventoryPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom dynamic Inventory role (Institute Admin only)' })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(@InventoryUser() actor: InventoryPlatformUser, @Body() dto: CreateInventoryDynamicRoleDto) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom Inventory roles for this institute' })
  listRoles(@InventoryUser() actor: InventoryPlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dynamic Inventory role with user assignments' })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(@InventoryUser() actor: InventoryPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dynamic Inventory role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @InventoryUser() actor: InventoryPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dynamic Inventory role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(@InventoryUser() actor: InventoryPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteRole(actor, id);
  }
}
