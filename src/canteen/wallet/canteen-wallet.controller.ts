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
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';

@ApiTags('Canteen Wallet & Ledger Management')
@ApiBearerAuth()
@UseGuards(CanteenJwtGuard, CanteenInstituteAdminViewOnlyGuard, CanteenPermissionsGuard)
@Controller('api/canteen')
export class CanteenWalletController {
  constructor(private readonly walletService: CanteenWalletService) {}

  // --- Wallets ---
  @ApiOperation({ summary: 'Create wallet for member' })
  @RequireCanteenPermission('canteen.wallet.create')
  @Post('members/:memberId/wallet')
  async createWallet(
    @Param('memberId') memberId: string,
    @Body() dto: CreateCanteenWalletDto,
    @CanteenUser() user: any,
  ) {
    return this.walletService.createWallet(memberId, dto, user?.id);
  }

  @ApiOperation({ summary: 'Get wallet profile by member ID' })
  @RequireCanteenPermission('canteen.wallet.view')
  @Get('members/:memberId/wallet')
  async getWalletByMemberId(@Param('memberId') memberId: string) {
    return this.walletService.getWalletByMemberId(memberId);
  }

  @ApiOperation({ summary: 'Get wallet details by wallet ID' })
  @RequireCanteenPermission('canteen.wallet.view')
  @Get('wallets/:walletId')
  async getWalletById(@Param('walletId') walletId: string) {
    return this.walletService.getWalletById(walletId);
  }

  @ApiOperation({ summary: 'Update wallet parameters (e.g. daily limit)' })
  @RequireCanteenPermission('canteen.wallet.update')
  @Patch('wallets/:walletId')
  async updateWallet(
    @Param('walletId') walletId: string,
    @Body() dto: UpdateCanteenWalletDto,
    @CanteenUser() user: any,
  ) {
    return this.walletService.updateWallet(walletId, dto, user?.id);
  }

  @ApiOperation({ summary: 'Delete empty wallet without transaction history' })
  @RequireCanteenPermission('canteen.wallet.delete')
  @Delete('wallets/:walletId')
  async deleteWallet(@Param('walletId') walletId: string, @CanteenUser() user: any) {
    return this.walletService.deleteWallet(walletId, user?.id);
  }

  // --- Top-ups ---
  @ApiOperation({ summary: 'Top-up wallet balance' })
  @RequireCanteenPermission('canteen.wallet.topup')
  @Post('wallets/:walletId/topups')
  async processTopup(
    @Param('walletId') walletId: string,
    @Body() dto: TopupCanteenWalletDto,
    @CanteenUser() user: any,
  ) {
    return this.walletService.processTopup(walletId, dto, user?.id);
  }

  @ApiOperation({ summary: 'Get top-up history for wallet' })
  @RequireCanteenPermission('canteen.wallet.view')
  @Get('wallets/:walletId/topups')
  async getTopupsByWallet(@Param('walletId') walletId: string) {
    return this.walletService.getTopupsByWallet(walletId);
  }

  @ApiOperation({ summary: 'Get top-up detail by ID' })
  @RequireCanteenPermission('canteen.wallet.view')
  @Get('wallet-topups/:topupId')
  async getTopupById(@Param('topupId') topupId: string) {
    return this.walletService.getTopupById(topupId);
  }

  // --- Wallet Ledger / Transactions ---
  @ApiOperation({ summary: 'Get append-only wallet transaction ledger' })
  @RequireCanteenPermission('canteen.wallet.transaction_view')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('wallets/:walletId/transactions')
  async getTransactionsByWallet(
    @Param('walletId') walletId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.walletService.getTransactionsByWallet(walletId, page, limit);
  }

  @ApiOperation({ summary: 'Get wallet ledger transaction detail' })
  @RequireCanteenPermission('canteen.wallet.transaction_view')
  @Get('wallet-transactions/:transactionId')
  async getTransactionById(@Param('transactionId') transactionId: string) {
    return this.walletService.getTransactionById(transactionId);
  }

  // --- Block / Unblock ---
  @ApiOperation({ summary: 'Block student wallet' })
  @RequireCanteenPermission('canteen.wallet.block')
  @Post('wallets/:walletId/block')
  async blockWallet(
    @Param('walletId') walletId: string,
    @Body() dto: BlockWalletDto,
    @CanteenUser() user: any,
  ) {
    return this.walletService.blockWallet(walletId, dto, user?.id);
  }

  @ApiOperation({ summary: 'Unblock student wallet' })
  @RequireCanteenPermission('canteen.wallet.unblock')
  @Post('wallets/:walletId/unblock')
  async unblockWallet(@Param('walletId') walletId: string, @CanteenUser() user: any) {
    return this.walletService.unblockWallet(walletId, user?.id);
  }
}
