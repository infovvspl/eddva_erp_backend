import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryJwtGuard } from '../auth/inventory-jwt.guard';
import { InventoryInstituteAdminViewOnlyGuard } from '../auth/inventory-institute-admin-view-only.guard';
import { InventoryPermissionsGuard } from '../auth/inventory-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { InventoryUser } from '../auth/inventory-user.decorator';
import type { InventoryPlatformUser } from '../auth/inventory-auth.service';
import { HoldersService } from './holders.service';
import { CreateHolderDto } from './dto/create-holder.dto';
import { UpdateHolderDto } from './dto/update-holder.dto';

@ApiTags('Inventory / Holders')
@ApiBearerAuth()
@UseGuards(InventoryJwtGuard, InventoryInstituteAdminViewOnlyGuard, InventoryPermissionsGuard)
@Controller('api/inventory/holders')
export class HoldersController {
  constructor(private readonly holdersService: HoldersService) {}

  @Post()
  @RequirePermission({ resource: 'holders', action: 'create' })
  @ApiOperation({ summary: 'Create a holder (staff/student/department) — use the parent system integration where available instead of duplicating master data' })
  create(@Body() dto: CreateHolderDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.holdersService.create(dto, user.eddva_user_id);
  }

  @Get()
  @RequirePermission({ resource: 'holders', action: 'read' })
  @ApiOperation({ summary: 'List/search/filter holders' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'holder_type', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('search') search?: string,
    @Query('holder_type') holderType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.holdersService.findAll({ search, holder_type: holderType, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Get(':id')
  @RequirePermission({ resource: 'holders', action: 'read' })
  @ApiOperation({ summary: 'Get a holder' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.holdersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'holders', action: 'update' })
  @ApiOperation({ summary: 'Update a holder' })
  @ApiParam({ name: 'id', example: 1 })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHolderDto, @InventoryUser() user: InventoryPlatformUser) {
    return this.holdersService.update(id, dto, user.eddva_user_id);
  }

  @Get(':id/current-issues')
  @RequirePermission({ resource: 'holders', action: 'read' })
  @ApiOperation({ summary: 'Everything currently issued to this holder (consumables and assets, including overdue/pending-approval)' })
  @ApiParam({ name: 'id', example: 1 })
  currentIssues(@Param('id', ParseIntPipe) id: number) {
    return this.holdersService.currentIssues(id);
  }
}
