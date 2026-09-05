import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { CostCentersService } from './cost-centers.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@ApiTags('Accounts / Cost Centers')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/cost-centers')
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @Post()
  @RequirePermission({ resource: 'cost_centers', action: 'create' })
  @ApiOperation({ summary: 'Create a cost center' })
  create(@Body() dto: CreateCostCenterDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.costCentersService.create(dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'cost_centers', action: 'read' })
  @ApiOperation({ summary: 'List/search cost centers' })
  @ApiQuery({ name: 'search', required: false })
  findAll(@AccountsUser() user: AccountsPlatformUser, @Query('search') search?: string) {
    return this.costCentersService.findAll(user, search);
  }

  @Get(':id')
  @RequirePermission({ resource: 'cost_centers', action: 'read' })
  @ApiOperation({ summary: 'Get a cost center' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.costCentersService.findOne(id, user);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'cost_centers', action: 'update' })
  @ApiOperation({ summary: 'Update a cost center (rename, activate/deactivate)' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateCostCenterDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.costCentersService.update(id, dto, user);
  }
}
