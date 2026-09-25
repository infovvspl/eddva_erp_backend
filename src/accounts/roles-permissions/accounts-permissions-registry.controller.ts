import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AccountsPermissionsRegistryService } from './accounts-permissions-registry.service';
import { CreateAccountsCustomPermissionDto, UpdateAccountsCustomPermissionDto } from './dto/create-custom-permission.dto';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { isAccountsAdmin } from '../common/accounts-access.service';

/**
 * Every route here was previously open to any authenticated Accounts user, so
 * a clerk could create, edit or delete catalogue permissions. Interim gate:
 * institute admin only, matching the write rule in AccountsDynamicRolesService.
 * This is replaced by proper accounts.permission.read / .manage keys once the
 * central ERP permission catalogue is in place.
 */
@ApiTags('Accounts / Dynamic Permissions Registry')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard)
@Controller('api/accounts/permissions')
export class AccountsPermissionsRegistryController {
  constructor(private readonly svc: AccountsPermissionsRegistryService) {}

  private assertAdmin(actor: AccountsPlatformUser) {
    if (!isAccountsAdmin(actor)) {
      throw new ForbiddenException('Only Institute Admin can view or manage the Accounts permissions registry');
    }
  }

  @Get()
  @ApiOperation({ summary: 'List all dynamic permissions from PostgreSQL DB (grouped by resource)' })
  listPermissions(@AccountsUser() user: AccountsPlatformUser) {
    this.assertAdmin(user);
    return this.svc.listPermissions();
  }

  @Post()
  @ApiOperation({ summary: 'Register a new dynamic custom permission in PostgreSQL DB (Institute Admin)' })
  createPermission(@AccountsUser() user: AccountsPlatformUser, @Body() dto: CreateAccountsCustomPermissionDto) {
    this.assertAdmin(user);
    return this.svc.createPermission(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific dynamic permission details' })
  @ApiParam({ name: 'id', description: 'permission_id of the Dynamic Permission (e.g. 1)' })
  getPermission(@AccountsUser() user: AccountsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    this.assertAdmin(user);
    return this.svc.getPermission(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update dynamic permission details or toggle active status' })
  @ApiParam({ name: 'id', description: 'permission_id of the Dynamic Permission to update (e.g. 1)' })
  updatePermission(
    @AccountsUser() user: AccountsPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountsCustomPermissionDto,
  ) {
    this.assertAdmin(user);
    return this.svc.updatePermission(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom dynamic permission (non-system permissions only)' })
  @ApiParam({ name: 'id', description: 'permission_id of the Custom Permission to delete (e.g. 1)' })
  deletePermission(@AccountsUser() user: AccountsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    this.assertAdmin(user);
    return this.svc.deletePermission(id);
  }
}
