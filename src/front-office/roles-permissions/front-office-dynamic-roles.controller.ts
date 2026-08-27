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
import { FrontOfficeDynamicRolesService } from './front-office-dynamic-roles.service';
import { CreateFrontOfficeDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateFrontOfficeDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignFrontOfficeUserToRoleDto } from './dto/assign-user.dto';
import { ResetFrontOfficeUserPasswordDto } from './dto/reset-password.dto';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';

@ApiTags('Front Office / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard)
@Controller('api/front-office/roles')
export class FrontOfficeDynamicRolesController {
  constructor(private readonly svc: FrontOfficeDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({ summary: 'Get full Front Office permission catalog (resources and available actions)' })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Get permissions matrix of the currently authenticated Front Office user' })
  getMyPermissions(@FrontOfficeUser() actor: FrontOfficePlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({ summary: 'Assign or re-assign a user to a dynamic Front Office role (Institute Admin only)' })
  assignUser(@FrontOfficeUser() actor: FrontOfficePlatformUser, @Body() dto: AssignFrontOfficeUserToRoleDto) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({ summary: 'List all user-role assignments for this institute' })
  listAssignments(@FrontOfficeUser() actor: FrontOfficePlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({ summary: 'Reset login password for an assigned Front Office user (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  resetPassword(
    @FrontOfficeUser() actor: FrontOfficePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetFrontOfficeUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({ summary: 'Revoke a user Front Office role assignment (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  revokeAssignment(@FrontOfficeUser() actor: FrontOfficePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom dynamic Front Office role (Institute Admin only)' })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(@FrontOfficeUser() actor: FrontOfficePlatformUser, @Body() dto: CreateFrontOfficeDynamicRoleDto) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom Front Office roles for this institute' })
  listRoles(@FrontOfficeUser() actor: FrontOfficePlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dynamic Front Office role with user assignments' })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(@FrontOfficeUser() actor: FrontOfficePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a dynamic Front Office role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @FrontOfficeUser() actor: FrontOfficePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFrontOfficeDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a dynamic Front Office role (Institute Admin only)' })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(@FrontOfficeUser() actor: FrontOfficePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteRole(actor, id);
  }
}
