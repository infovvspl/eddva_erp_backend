import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateCanteenWalletDto } from './dto/create-canteen-wallet.dto';
import { UpdateCanteenWalletDto } from './dto/update-canteen-wallet.dto';
import { TopupCanteenWalletDto } from './dto/topup-canteen-wallet.dto';
import { BlockWalletDto } from './dto/block-wallet.dto';
import {
  CanteenTopupStatus,
  CanteenWalletRefType,
  CanteenWalletStatus,
  CanteenWalletTransType,
} from '@prisma/client';

@Injectable()
export class CanteenWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // --- Wallets ---
  async getWalletByMemberId(memberId: string) {
    const wallet = await this.prisma.canteenWallet.findUnique({
      where: { memberId },
      include: {
        member: true,
        transactions: {
          orderBy: { transactedAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found for this member.');
    }
    return wallet;
  }

  async getWalletById(id: string) {
    const wallet = await this.prisma.canteenWallet.findUnique({
      where: { id },
      include: {
        member: true,
        transactions: {
          orderBy: { transactedAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!wallet) {
      throw new NotFoundException('Canteen wallet not found.');
    }
    return wallet;
  }

  async createWallet(memberId: string, dto: CreateCanteenWalletDto, actorUserId?: string) {
    const member = await this.prisma.canteenMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException('Member profile not found.');
    }

    const existing = await this.prisma.canteenWallet.findUnique({
      where: { memberId },
    });
    if (existing) {
      throw new ConflictException('A wallet already exists for this member.');
    }

    const initialBal = Number(dto.initialBalance || 0);

    const wallet = await this.prisma.$transaction(async (tx) => {
      const w = await tx.canteenWallet.create({
        data: {
          memberId,
          balance: initialBal,
          status: CanteenWalletStatus.ACTIVE,
          dailySpendLimit: dto.dailySpendLimit || null,
        },
        include: { member: true },
      });

      if (initialBal > 0) {
        await tx.canteenWalletTransaction.create({
          data: {
            walletId: w.id,
            type: CanteenWalletTransType.CREDIT,
            amount: initialBal,
            referenceType: CanteenWalletRefType.TOPUP,
            referenceId: 'INITIAL_DEPOSIT',
            balanceAfter: initialBal,
            createdBy: actorUserId,
          },
        });
      }

      return w;
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenWallet',
      entityId: wallet.id,
      action: 'Canteen Wallet Created',
      metadata: { memberId, initialBalance: initialBal },
    });

    return wallet;
  }

  async updateWallet(id: string, dto: UpdateCanteenWalletDto, actorUserId?: string) {
    const wallet = await this.getWalletById(id);

    const updated = await this.prisma.canteenWallet.update({
      where: { id },
      data: {
        status: dto.status ?? wallet.status,
        dailySpendLimit:
          dto.dailySpendLimit !== undefined ? dto.dailySpendLimit : wallet.dailySpendLimit,
      },
      include: { member: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenWallet',
      entityId: id,
      action: 'Canteen Wallet Parameters Updated',
      metadata: { status: updated.status, dailySpendLimit: updated.dailySpendLimit },
    });

    return updated;
  }

  async deleteWallet(id: string, actorUserId?: string) {
    const wallet = await this.prisma.canteenWallet.findUnique({
      where: { id },
      include: { transactions: true },
    });
    if (!wallet) {
      throw new NotFoundException('Canteen wallet not found.');
    }

    if (wallet.transactions.length > 0 || Number(wallet.balance) > 0) {
      throw new BadRequestException(
        'Cannot physically delete a wallet with financial balance or transaction history.',
      );
    }

    await this.prisma.canteenWallet.delete({ where: { id } });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenWallet',
      entityId: id,
      action: 'Canteen Wallet Deleted',
    });

    return { message: 'Wallet deleted successfully.' };
  }

  // --- Top-ups ---
  async processTopup(walletId: string, dto: TopupCanteenWalletDto, approverUserId?: string) {
    const wallet = await this.getWalletById(walletId);

    if (wallet.status !== CanteenWalletStatus.ACTIVE) {
      throw new BadRequestException('Cannot top-up a blocked or inactive wallet.');
    }

    const topupAmount = Number(dto.amount);
    if (topupAmount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than 0.');
    }

    // Atomic transaction for Topup + Credit Ledger + Balance Update
    return this.prisma.$transaction(async (tx) => {
      const topup = await tx.canteenWalletTopup.create({
        data: {
          walletId,
          amount: topupAmount,
          paymentMode: dto.paymentMode,
          transactionRef: dto.transactionRef || null,
          approvedBy: approverUserId || null,
          status: CanteenTopupStatus.SUCCESS,
        },
      });

      const currentBal = Number(wallet.balance);
      const newBal = currentBal + topupAmount;

      await tx.canteenWallet.update({
        where: { id: walletId },
        data: { balance: newBal },
      });

      const ledger = await tx.canteenWalletTransaction.create({
        data: {
          walletId,
          type: CanteenWalletTransType.CREDIT,
          amount: topupAmount,
          referenceType: CanteenWalletRefType.TOPUP,
          referenceId: topup.id,
          balanceAfter: newBal,
          createdBy: approverUserId,
        },
      });

      await this.auditService.log({
        userId: approverUserId,
        entityType: 'CanteenWalletTopup',
        entityId: topup.id,
        action: 'Wallet Top-up Successful',
        metadata: {
          walletId,
          amount: topupAmount,
          newBalance: newBal,
          transactionId: ledger.id,
        },
      });

      return {
        topup,
        walletBalance: newBal,
        ledgerTransactionId: ledger.id,
      };
    });
  }

  async getTopupsByWallet(walletId: string) {
    await this.getWalletById(walletId);
    return this.prisma.canteenWalletTopup.findMany({
      where: { walletId },
      include: { approver: { select: { id: true, name: true, email: true } } },
      orderBy: { topupDate: 'desc' },
    });
  }

  async getTopupById(id: string) {
    const topup = await this.prisma.canteenWalletTopup.findUnique({
      where: { id },
      include: {
        wallet: { include: { member: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });
    if (!topup) {
      throw new NotFoundException('Top-up record not found.');
    }
    return topup;
  }

  // --- Wallet Ledger / Transactions ---
  async getTransactionsByWallet(walletId: string, page = 1, limit = 25) {
    await this.getWalletById(walletId);

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, data] = await Promise.all([
      this.prisma.canteenWalletTransaction.count({ where: { walletId } }),
      this.prisma.canteenWalletTransaction.findMany({
        where: { walletId },
        skip,
        take,
        orderBy: { transactedAt: 'desc' },
      }),
    ]);

    return {
      data,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async getTransactionById(id: string) {
    const txn = await this.prisma.canteenWalletTransaction.findUnique({
      where: { id },
      include: { wallet: { include: { member: true } } },
    });
    if (!txn) {
      throw new NotFoundException('Wallet ledger transaction not found.');
    }
    return txn;
  }

  // --- Block / Unblock ---
  async blockWallet(id: string, dto: BlockWalletDto, actorUserId?: string) {
    const wallet = await this.getWalletById(id);

    if (wallet.status === CanteenWalletStatus.BLOCKED) {
      throw new BadRequestException('Wallet is already blocked.');
    }

    const updated = await this.prisma.canteenWallet.update({
      where: { id },
      data: { status: CanteenWalletStatus.BLOCKED },
      include: { member: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenWallet',
      entityId: id,
      action: 'Canteen Wallet Blocked',
      reason: dto.reason || 'Administrative wallet block',
    });

    return updated;
  }

  async unblockWallet(id: string, actorUserId?: string) {
    const wallet = await this.getWalletById(id);

    if (wallet.status === CanteenWalletStatus.ACTIVE) {
      throw new BadRequestException('Wallet is already active.');
    }

    const updated = await this.prisma.canteenWallet.update({
      where: { id },
      data: { status: CanteenWalletStatus.ACTIVE },
      include: { member: true },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenWallet',
      entityId: id,
      action: 'Canteen Wallet Unblocked',
    });

    return updated;
  }
}
