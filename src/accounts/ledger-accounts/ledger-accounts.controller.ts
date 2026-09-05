import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { LedgerAccountsService } from './ledger-accounts.service';
import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto';
import { UpdateLedgerAccountDto } from './dto/update-ledger-account.dto';

@ApiTags('Accounts / Chart of Accounts')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/ledger-accounts')
export class LedgerAccountsController {
  constructor(private readonly ledgerAccountsService: LedgerAccountsService) {}

  @Post()
  @RequirePermission({ resource: 'coa', action: 'create' })
  @ApiOperation({ summary: 'Create a (leaf/postable) ledger account under an account group' })
  create(@Body() dto: CreateLedgerAccountDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.ledgerAccountsService.create(dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'coa', action: 'read' })
  @ApiOperation({ summary: 'List/search ledger accounts' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(@AccountsUser() user: AccountsPlatformUser, @Query('search') search?: string, @Query('groupId') groupId?: string, @Query('isActive') isActive?: string) {
    return this.ledgerAccountsService.findAll(user, {
      search,
      groupId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get(':id')
  @RequirePermission({ resource: 'coa', action: 'read' })
  @ApiOperation({ summary: 'Get a ledger account with its group' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.ledgerAccountsService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'coa', action: 'update' })
  @ApiOperation({ summary: 'Update a ledger account (rename, re-group, activate/deactivate, allow/disallow posting)' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateLedgerAccountDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.ledgerAccountsService.update(id, dto, user);
  }
}
