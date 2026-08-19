import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CanteenRbacService } from './canteen-rbac.service';
import { CreateCanteenRoleDto } from './dto/create-canteen-role.dto';
import { UpdateCanteenRoleDto } from './dto/update-canteen-role.dto';
import { AssignCanteenPermissionsDto } from './dto/assign-canteen-permissions.dto';
import { CreateCanteenPermissionDto } from './dto/create-canteen-permission.dto';
import { UpdateCanteenPermissionDto } from './dto/update-canteen-permission.dto';
import { AssignUserCanteenRoleDto } from './dto/assign-user-canteen-role.dto';
import { CreateCanteenUserDto } from './dto/create-canteen-user.dto';
import { UpdateCanteenUserDto } from './dto/update-canteen-user.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CanteenPermissionsGuard } from '../guards/canteen-permissions.guard';
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';

@ApiTags('Canteen RBAC Management (Institute Admin Only)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanteenPermissionsGuard)
@Controller('api/canteen')
export class CanteenRbacController {
  constructor(private readonly rbacService: CanteenRbacService) {}

  // ==========================================
  // --- 1. Canteen Permissions ---
  // ==========================================

  @ApiOperation({ summary: 'Create Canteen permission (Institute Admin only)' })
  @RequireCanteenPermission('canteen.permission.create')
  @Post('permissions')
  async createPermission(
    @Body() dto: CreateCanteenPermissionDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.createPermission(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List all Canteen permissions (Institute Admin only)' })
  @RequireCanteenPermission('canteen.permission.view')
  @Get('permissions')
  async getPermissions() {
    return this.rbacService.getPermissions();
  }

  @ApiOperation({ summary: 'Get Canteen permission detail (Institute Admin only)' })
  @RequireCanteenPermission('canteen.permission.view')
  @Get('permissions/:id')
  async getPermissionById(@Param('id') id: string) {
    return this.rbacService.getPermissionById(id);
  }

  @ApiOperation({ summary: 'Update Canteen permission (Institute Admin only)' })
  @RequireCanteenPermission('canteen.permission.update')
  @Patch('permissions/:id')
  async updatePermission(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenPermissionDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.updatePermission(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Delete custom Canteen permission (Institute Admin only)' })
  @RequireCanteenPermission('canteen.permission.delete')
  @Delete('permissions/:id')
  async deletePermission(@Param('id') id: string, @GetUser() user: any) {
    return this.rbacService.deletePermission(id, user?.id || user?.userId);
  }

  // ==========================================
  // --- 2. Canteen Roles ---
  // ==========================================

  @ApiOperation({ summary: 'Create Canteen role (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.create')
  @Post('roles')
  async createRole(@Body() dto: CreateCanteenRoleDto, @GetUser() user: any) {
    return this.rbacService.createRole(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List Canteen roles (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.view')
  @Get('roles')
  async getRoles() {
    return this.rbacService.getRoles();
  }

  @ApiOperation({ summary: 'Get Canteen role detail (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.view')
  @Get('roles/:id')
  async getRoleById(@Param('id') id: string) {
    return this.rbacService.getRoleById(id);
  }

  @ApiOperation({ summary: 'Update Canteen role (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.update')
  @Patch('roles/:id')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenRoleDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.updateRole(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Delete Canteen role (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.delete')
  @Delete('roles/:id')
  async deleteRole(@Param('id') id: string, @GetUser() user: any) {
    return this.rbacService.deleteRole(id, user?.id || user?.userId);
  }

  // --- Role Permissions ---

  @ApiOperation({ summary: 'Get permissions assigned to Canteen role (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.view')
  @Get('roles/:id/permissions')
  async getRolePermissions(@Param('id') id: string) {
    return this.rbacService.getRolePermissions(id);
  }

  @ApiOperation({ summary: 'Assign or update Canteen role permissions (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.assign')
  @Patch('roles/:id/permissions')
  async assignRolePermissions(
    @Param('id') id: string,
    @Body() dto: AssignCanteenPermissionsDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.assignRolePermissions(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Add single permission to Canteen role (ON toggle - Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.assign')
  @Post('roles/:id/permissions/:permissionId')
  async addPermissionToRole(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @GetUser() user: any,
  ) {
    return this.rbacService.addPermissionToRole(id, permissionId, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Remove single permission from Canteen role (OFF toggle - Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.assign')
  @Delete('roles/:id/permissions/:permissionId')
  async removePermissionFromRole(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @GetUser() user: any,
  ) {
    return this.rbacService.removePermissionFromRole(id, permissionId, user?.id || user?.userId);
  }

  // ==========================================
  // --- 3. Canteen Users & Role Assignments ---
  // ==========================================

  @ApiOperation({ summary: 'Create a new user with optional Canteen role (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.assign')
  @Post('users')
  async createUser(
    @Body() dto: CreateCanteenUserDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.createUser(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List Canteen users (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.view')
  @Get('users')
  async getUsers() {
    return this.rbacService.getUsers();
  }

  @ApiOperation({ summary: 'Get Canteen user by ID (Institute Admin only)' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @RequireCanteenPermission('canteen.role.view')
  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.rbacService.getUserById(id);
  }

  @ApiOperation({ summary: 'Update Canteen user (Institute Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @RequireCanteenPermission('canteen.role.assign')
  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenUserDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.updateUser(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Assign Canteen role to user (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.assign')
  @Post('users/:userId/roles')
  async assignUserRole(
    @Param('userId') userId: string,
    @Body() dto: AssignUserCanteenRoleDto,
    @GetUser() user: any,
  ) {
    return this.rbacService.assignUserRole(userId, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Get Canteen roles assigned to user (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.view')
  @Get('users/:userId/roles')
  async getUserRoles(@Param('userId') userId: string) {
    return this.rbacService.getUserRoles(userId);
  }

  @ApiOperation({ summary: 'Remove Canteen role from user (Institute Admin only)' })
  @RequireCanteenPermission('canteen.role.remove')
  @Delete('users/:userId/roles/:roleId')
  async removeUserRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @GetUser() user: any,
  ) {
    return this.rbacService.removeUserRole(userId, roleId, user?.id || user?.userId);
  }
}
