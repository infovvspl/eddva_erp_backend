import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { VoucherStatus } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { CancelVoucherDto } from './dto/cancel-voucher.dto';

@ApiTags('Accounts / Vouchers')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post()
  @RequirePermission({ resource: 'vouchers', action: 'create' })
  @ApiOperation({ summary: 'Create a draft voucher (Journal/Payment/Receipt/Contra) — validated and balanced, not yet posted' })
  create(@Body() dto: CreateVoucherDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.vouchersService.create(dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'vouchers', action: 'read' })
  @ApiOperation({ summary: 'List/filter vouchers' })
  @ApiQuery({ name: 'fyId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: VoucherStatus })
  @ApiQuery({ name: 'voucherTypeCode', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'sourceModule', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @AccountsUser() user: AccountsPlatformUser,
    @Query('fyId') fyId?: string,
    @Query('status') status?: VoucherStatus,
    @Query('voucherTypeCode') voucherTypeCode?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sourceModule') sourceModule?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.vouchersService.findAll(
      user,
      { fyId, status, voucherTypeCode, dateFrom, dateTo, sourceModule },
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get(':id')
  @RequirePermission({ resource: 'vouchers', action: 'read' })
  @ApiOperation({ summary: 'Get a voucher with its entries, attachments, and reversal linkage' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.vouchersService.findOne(id, user);
  }

  @Post(':id/post')
  @RequirePermission({ resource: 'vouchers', action: 'post' })
  @ApiOperation({ summary: 'Post a draft voucher — appends it to the ledger; irreversible except via cancel/reversal' })
  @ApiParam({ name: 'id' })
  post(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.vouchersService.post(id, user);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'vouchers', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel a draft voucher, or reverse a posted one with an equal-and-opposite reversal voucher' })
  @ApiParam({ name: 'id' })
  cancel(@Param('id') id: string, @Body() dto: CancelVoucherDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.vouchersService.cancel(id, dto, user);
  }
}
