import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CanteenWalletService } from './canteen-wallet.service';
import { CreateCanteenWalletDto } from './dto/create-canteen-wallet.dto';
import { UpdateCanteenWalletDto } from './dto/update-canteen-wallet.dto';
import { TopupCanteenWalletDto } from './dto/topup-canteen-wallet.dto';
import { BlockWalletDto } from './dto/block-wallet.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';

@ApiTags('Canteen Wallet & Ledger Management')
@ApiBearerAuth()
@UseGuards(
  CanteenJwtGuard,
  CanteenInstituteAdminViewOnlyGuard,
  CanteenPermissionsGuard,
)
@Controller('api/canteen')
export class CanteenWalletController {
  constructor(private readonly walletService: CanteenWalletService) {}

  // --- Wallets ---
  @ApiOperation({ summary: 'Create wallet for member' })
  @RequirePermission({ resource: 'wallets', action: 'create' })
  @Post('members/:memberId/wallet')
  async createWallet(
    @Param('memberId') memberId: string,
    @Body() dto: CreateCanteenWalletDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.walletService.createWallet(user.institute_id, memberId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Get wallet profile by member ID' })
  @RequirePermission({ resource: 'wallets', action: 'read' })
  @Get('members/:memberId/wallet')
  async getWalletByMemberId(@CanteenUser() user: CanteenPlatformUser, @Param('memberId') memberId: string) {
    return this.walletService.getWalletByMemberId(user.institute_id, memberId);
  }

  @ApiOperation({ summary: 'Get wallet details by wallet ID' })
  @RequirePermission({ resource: 'wallets', action: 'read' })
  @Get('wallets/:walletId')
  async getWalletById(@CanteenUser() user: CanteenPlatformUser, @Param('walletId') walletId: string) {
    return this.walletService.getWalletById(user.institute_id, walletId);
  }

  @ApiOperation({ summary: 'Update wallet parameters (e.g. daily limit)' })
  @RequirePermission({ resource: 'wallets', action: 'update' })
  @Patch('wallets/:walletId')
  async updateWallet(
    @Param('walletId') walletId: string,
    @Body() dto: UpdateCanteenWalletDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.walletService.updateWallet(user.institute_id, walletId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Delete empty wallet without transaction history' })
  @RequirePermission({ resource: 'wallets', action: 'delete' })
  @Delete('wallets/:walletId')
  async deleteWallet(@Param('walletId') walletId: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.walletService.deleteWallet(user.institute_id, walletId, user.eddva_user_id);
  }

  // --- Top-ups ---
  @ApiOperation({ summary: 'Top-up wallet balance' })
  @RequirePermission({ resource: 'wallets', action: 'topup' })
  @Post('wallets/:walletId/topups')
  async processTopup(
    @Param('walletId') walletId: string,
    @Body() dto: TopupCanteenWalletDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.walletService.processTopup(user.institute_id, walletId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Get top-up history for wallet' })
  @RequirePermission({ resource: 'wallets', action: 'read' })
  @Get('wallets/:walletId/topups')
  async getTopupsByWallet(@CanteenUser() user: CanteenPlatformUser, @Param('walletId') walletId: string) {
    return this.walletService.getTopupsByWallet(user.institute_id, walletId);
  }

  @ApiOperation({ summary: 'Get top-up detail by ID' })
  @RequirePermission({ resource: 'wallets', action: 'read' })
  @Get('wallet-topups/:topupId')
  async getTopupById(@CanteenUser() user: CanteenPlatformUser, @Param('topupId') topupId: string) {
    return this.walletService.getTopupById(user.institute_id, topupId);
  }

  // --- Wallet Ledger / Transactions ---
  @ApiOperation({ summary: 'Get append-only wallet transaction ledger' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @RequirePermission({ resource: 'wallet_transactions', action: 'read' })
  @Get('wallets/:walletId/transactions')
  async getTransactionsByWallet(
    @CanteenUser() user: CanteenPlatformUser,
    @Param('walletId') walletId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.walletService.getTransactionsByWallet(user.institute_id, walletId, page, limit);
  }

  @ApiOperation({ summary: 'Get wallet ledger transaction detail' })
  @RequirePermission({ resource: 'wallet_transactions', action: 'read' })
  @Get('wallet-transactions/:transactionId')
  async getTransactionById(@CanteenUser() user: CanteenPlatformUser, @Param('transactionId') transactionId: string) {
    return this.walletService.getTransactionById(user.institute_id, transactionId);
  }

  // --- Block / Unblock ---
  @ApiOperation({ summary: 'Block student wallet' })
  @RequirePermission({ resource: 'wallets', action: 'block' })
  @Post('wallets/:walletId/block')
  async blockWallet(
    @Param('walletId') walletId: string,
    @Body() dto: BlockWalletDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.walletService.blockWallet(user.institute_id, walletId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Unblock student wallet' })
  @RequirePermission({ resource: 'wallets', action: 'unblock' })
  @Post('wallets/:walletId/unblock')
  async unblockWallet(@Param('walletId') walletId: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.walletService.unblockWallet(user.institute_id, walletId, user.eddva_user_id);
  }
}
