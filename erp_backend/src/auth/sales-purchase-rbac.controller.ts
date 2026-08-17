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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RequirePermission } from './decorators/require-permission.decorator';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Sales & Purchase RBAC')
@Controller('api/sales-purchase')
export class SalesPurchaseRbacController {
  constructor(private readonly authService: AuthService) {}

  // --- 1. Permissions ---
  @ApiOperation({ summary: 'List Sales & Purchase permissions' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  async getPermissions(@GetUser() user: any) {
    return this.authService.getPermissions(user.instituteId, 'SALES_PURCHASE');
  }

  @ApiOperation({ summary: 'Create new Sales & Purchase permission' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Post('permissions')
  async createPermission(@Body() dto: CreatePermissionDto, @GetUser() user: any) {
    return this.authService.createPermission(dto, user);
  }

  @ApiOperation({ summary: 'Get Sales & Purchase permission by ID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.view')
  @Get('permissions/:id')
  async getPermissionById(@Param('id') id: string) {
    return this.authService.getPermissionById(id);
  }

  @ApiOperation({ summary: 'Update Sales & Purchase permission' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Patch('permissions/:id')
  async updatePermission(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
    @GetUser() user: any,
  ) {
    return this.authService.updatePermission(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete Sales & Purchase permission' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Delete('permissions/:id')
  async deletePermission(@Param('id') id: string, @GetUser() user: any) {
    return this.authService.deletePermission(id, user);
  }

  // --- 2. Roles ---
  @ApiOperation({ summary: 'List Sales & Purchase roles' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.view')
  @Get('roles')
  async getRoles(@GetUser() user: any) {
    return this.authService.getRoles(user.instituteId, 'SALES_PURCHASE');
  }

  @ApiOperation({ summary: 'Create new Sales & Purchase role' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Post('roles')
  async createRole(@Body() dto: CreateRoleDto, @GetUser() user: any) {
    return this.authService.createRole(dto, user);
  }

  @ApiOperation({ summary: 'Get Sales & Purchase role by ID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.view')
  @Get('roles/:id')
  async getRoleById(@Param('id') id: string) {
    return this.authService.getRoleById(id);
  }

  @ApiOperation({ summary: 'Update Sales & Purchase role details' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Patch('roles/:id')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @GetUser() user: any,
  ) {
    return this.authService.updateRole(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete Sales & Purchase role' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Delete('roles/:id')
  async deleteRole(@Param('id') id: string, @GetUser() user: any) {
    return this.authService.deleteRole(id, user);
  }

  @ApiOperation({ summary: 'Assign permissions to Sales & Purchase role' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Patch('roles/:roleId/permissions')
  async assignRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: AssignRolePermissionsDto,
    @GetUser() user: any,
  ) {
    return this.authService.assignRolePermissions(roleId, dto, user);
  }

  @ApiOperation({ summary: 'Add single permission to Sales & Purchase role (ON toggle)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Post('roles/:roleId/permissions/:permissionId')
  async addPermissionToRole(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
    @GetUser() user: any,
  ) {
    return this.authService.addPermissionToRole(roleId, permissionId, user);
  }

  @ApiOperation({ summary: 'Remove single permission from Sales & Purchase role (OFF toggle)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.roles.manage')
  @Delete('roles/:roleId/permissions/:permissionId')
  async removePermissionFromRole(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
    @GetUser() user: any,
  ) {
    return this.authService.removePermissionFromRole(roleId, permissionId, user);
  }

  // --- 3. Users ---
  @ApiOperation({ summary: 'List Sales & Purchase users' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.users.view')
  @Get('users')
  async getUsers(@GetUser() user: any) {
    return this.authService.getUsers(user.instituteId, 'SALES_PURCHASE');
  }

  @ApiOperation({ summary: 'Create new Sales & Purchase user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.users.manage')
  @Post('users')
  async createUser(@Body() dto: CreateUserDto, @GetUser() user: any) {
    return this.authService.createUser(dto, user);
  }

  @ApiOperation({ summary: 'Get Sales & Purchase user by ID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.users.view')
  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.authService.getUserById(id);
  }

  @ApiOperation({ summary: 'Update Sales & Purchase user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.users.manage')
  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @GetUser() user: any,
  ) {
    return this.authService.updateUser(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete Sales & Purchase user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institute_admin.users.manage')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @GetUser() user: any) {
    return this.authService.deleteUser(id, user);
  }
}

