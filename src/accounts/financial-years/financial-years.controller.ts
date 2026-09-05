import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { FinancialYearsService } from './financial-years.service';
import { ClosingService } from '../closing/closing.service';
import { CreateFinancialYearDto } from './dto/create-financial-year.dto';

@ApiTags('Accounts / Financial Years')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/financial-years')
export class FinancialYearsController {
  constructor(
    private readonly financialYearsService: FinancialYearsService,
    private readonly closingService: ClosingService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'financial_years', action: 'create' })
  @ApiOperation({ summary: 'Create a financial year' })
  create(@Body() dto: CreateFinancialYearDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.financialYearsService.create(dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'financial_years', action: 'read' })
  @ApiOperation({ summary: 'List financial years' })
  findAll(@AccountsUser() user: AccountsPlatformUser) {
    return this.financialYearsService.findAll(user);
  }

  @Get(':id')
  @RequirePermission({ resource: 'financial_years', action: 'read' })
  @ApiOperation({ summary: 'Get a financial year' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.financialYearsService.findOne(id, user);
  }

  @Post(':id/close')
  @RequirePermission({ resource: 'financial_years', action: 'close' })
  @ApiOperation({ summary: 'Close a financial year — computes and snapshots closing balances for every ledger account, then freezes the year' })
  @ApiParam({ name: 'id' })
  close(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.closingService.closeFinancialYear(id, user);
  }
}
