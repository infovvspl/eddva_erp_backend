import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { AccountGroupsService } from './account-groups.service';
import { CreateAccountGroupDto } from './dto/create-account-group.dto';
import { UpdateAccountGroupDto } from './dto/update-account-group.dto';

@ApiTags('Accounts / Chart of Accounts')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/account-groups')
export class AccountGroupsController {
  constructor(private readonly accountGroupsService: AccountGroupsService) {}

  @Post()
  @RequirePermission({ resource: 'coa', action: 'create' })
  @ApiOperation({ summary: 'Create an account group (optionally nested under a parent group)' })
  create(@Body() dto: CreateAccountGroupDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.accountGroupsService.create(dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'coa', action: 'read' })
  @ApiOperation({ summary: 'List/search account groups' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@AccountsUser() user: AccountsPlatformUser, @Query('search') search?: string) {
    return this.accountGroupsService.findAll(user, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'coa', action: 'read' })
  @ApiOperation({ summary: 'Get an account group with its parent, sub-groups, and ledger accounts' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.accountGroupsService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'coa', action: 'update' })
  @ApiOperation({ summary: 'Update an account group (rename, re-parent)' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateAccountGroupDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.accountGroupsService.update(id, dto, user);
  }
}
