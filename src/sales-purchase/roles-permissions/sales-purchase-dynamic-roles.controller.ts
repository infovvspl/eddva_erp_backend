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
import { SalesPurchaseDynamicRolesService } from './sales-purchase-dynamic-roles.service';
import { CreateSalesPurchaseDynamicRoleDto } from './dto/create-dynamic-role.dto';
import { UpdateSalesPurchaseDynamicRoleDto } from './dto/update-dynamic-role.dto';
import { AssignSalesPurchaseUserToRoleDto } from './dto/assign-user.dto';
import { ResetSalesPurchaseUserPasswordDto } from './dto/reset-password.dto';
import { SalesPurchaseJwtGuard } from '../auth/sales-purchase-jwt.guard';
import { SalesPurchaseUser } from '../auth/sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from '../auth/sales-purchase-auth.service';

@ApiTags('Sales & Purchase / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(SalesPurchaseJwtGuard)
@Controller('api/sales-purchase/roles')
export class SalesPurchaseDynamicRolesController {
  constructor(private readonly svc: SalesPurchaseDynamicRolesService) {}

  @Get('permissions/catalog')
  @ApiOperation({
    summary:
      'Get full Sales & Purchase permission catalog (resources and available actions)',
  })
  getPermissionCatalog() {
    return this.svc.getPermissionCatalog();
  }

  @Get('permissions/me')
  @ApiOperation({
    summary:
      'Get permissions matrix of the currently authenticated Sales & Purchase user',
  })
  getMyPermissions(@SalesPurchaseUser() actor: SalesPurchasePlatformUser) {
    return this.svc.getMyPermissions(actor);
  }

  @Post('user-assignments')
  @ApiOperation({
    summary:
      'Assign or re-assign a user to a dynamic Sales & Purchase role (Institute Admin only)',
  })
  assignUser(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Body() dto: AssignSalesPurchaseUserToRoleDto,
  ) {
    return this.svc.assignUser(actor, dto);
  }

  @Get('user-assignments')
  @ApiOperation({
    summary: 'List all user-role assignments for this institute (Institute Admin only)',
  })
  listAssignments(@SalesPurchaseUser() actor: SalesPurchasePlatformUser) {
    return this.svc.listUserAssignments(actor);
  }

  @Patch('user-assignments/:id/password')
  @ApiOperation({
    summary:
      'Reset login password for an assigned Sales & Purchase user (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  resetPassword(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetSalesPurchaseUserPasswordDto,
  ) {
    return this.svc.resetUserPassword(actor, id, dto.new_password);
  }

  @Delete('user-assignments/:id')
  @ApiOperation({
    summary:
      'Revoke a user Sales & Purchase role assignment (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'assignment_id (e.g. 1)' })
  revokeAssignment(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.revokeUser(actor, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a custom dynamic Sales & Purchase role (Institute Admin only)',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Body() dto: CreateSalesPurchaseDynamicRoleDto,
  ) {
    return this.svc.createRole(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all custom Sales & Purchase roles for this institute (Institute Admin only)',
  })
  listRoles(@SalesPurchaseUser() actor: SalesPurchasePlatformUser) {
    return this.svc.listRoles(actor);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a specific dynamic Sales & Purchase role with user assignments (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id (e.g. 1)' })
  getRole(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.getRole(actor, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a dynamic Sales & Purchase role (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to update (e.g. 1)' })
  updateRole(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesPurchaseDynamicRoleDto,
  ) {
    return this.svc.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a dynamic Sales & Purchase role (Institute Admin only)',
  })
  @ApiParam({ name: 'id', description: 'role_id to delete (e.g. 1)' })
  deleteRole(
    @SalesPurchaseUser() actor: SalesPurchasePlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deleteRole(actor, id);
  }
}
