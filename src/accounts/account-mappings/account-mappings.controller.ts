import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { AccountMappingsService } from './account-mappings.service';
import { SetAccountMappingDto } from './dto/set-account-mapping.dto';

@ApiTags('Accounts / Account Mappings')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/account-mappings')
export class AccountMappingsController {
  constructor(private readonly accountMappingsService: AccountMappingsService) {}

  @Post()
  @RequirePermission({ resource: 'mappings', action: 'manage' })
  @ApiOperation({ summary: 'Map a logical accounting role (AR, AP, SALES_INCOME, PURCHASE_EXPENSE, CASH, BANK) to a ledger account, for auto-posting' })
  set(@Body() dto: SetAccountMappingDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.accountMappingsService.set(dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'mappings', action: 'manage' })
  @ApiOperation({ summary: 'List configured account mappings' })
  findAll(@AccountsUser() user: AccountsPlatformUser) {
    return this.accountMappingsService.findAll(user);
  }
}
