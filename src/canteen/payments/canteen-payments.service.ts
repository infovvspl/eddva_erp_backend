import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateCanteenPaymentDto } from './dto/create-canteen-payment.dto';
import { RefundCanteenPaymentDto } from './dto/refund-canteen-payment.dto';
import {
  CanteenOrderStatus,
  CanteenPaymentMode,
  CanteenPaymentStatus,
  CanteenWalletRefType,
  CanteenWalletTransType,
} from '@prisma/client';

@Injectable()
export class CanteenPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async processPayment(orderId: string, dto: CreateCanteenPaymentDto, staffUserId: string) {
    const order = await this.prisma.canteenOrder.findUnique({
      where: { id: orderId },
      include: {
        payments: true,
        member: { include: { wallet: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Canteen order not found.');
    }

    if (order.status === CanteenOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot record payment for a cancelled order.');
    }

    const successfulPaymentsTotal = order.payments
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const remainingPayable = Number(order.totalAmount) - successfulPaymentsTotal;

    if (remainingPayable <= 0.001) {
      throw new BadRequestException('Order is already fully paid.');
    }

    const payAmount = Number(dto.amount);
    if (payAmount > remainingPayable + 0.01) {
      throw new BadRequestException(
        `Payment amount (₹${payAmount.toFixed(2)}) exceeds remaining payable balance (₹${remainingPayable.toFixed(2)}).`,
      );
    }

    // Atomic transaction for payment + wallet debit + order payment status update
    return this.prisma.$transaction(async (tx) => {
      let transactionRef = dto.transactionRef || null;

      // Handle WALLET payment mode
      if (dto.paymentMode === CanteenPaymentMode.WALLET) {
        if (!order.memberId || !order.member?.wallet) {
          throw new BadRequestException('Order does not have a linked member wallet for wallet payment.');
        }

        const wallet = order.member.wallet;
        if (wallet.status !== 'ACTIVE') {
          throw new BadRequestException('Member wallet is currently blocked or inactive.');
        }

        const currentBalance = Number(wallet.balance);
        if (currentBalance < payAmount) {
          throw new BadRequestException(
            `Insufficient wallet balance (Current: ₹${currentBalance.toFixed(2)}, Required: ₹${payAmount.toFixed(2)}).`,
          );
        }

        if (wallet.dailySpendLimit) {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);

          const todayDebits = await tx.canteenWalletTransaction.aggregate({
            where: {
              walletId: wallet.id,
              type: CanteenWalletTransType.DEBIT,
              transactedAt: { gte: startOfDay },
            },
            _sum: { amount: true },
          });

          const totalTodaySpent = Number(todayDebits._sum.amount || 0);
          const limit = Number(wallet.dailySpendLimit);
          if (totalTodaySpent + payAmount > limit) {
            throw new BadRequestException(
              `Daily wallet spending limit of ₹${limit.toFixed(2)} exceeded (Already spent today: ₹${totalTodaySpent.toFixed(2)}).`,
            );
          }
        }

        // Deduct wallet balance
        const newBalance = currentBalance - payAmount;
        await tx.canteenWallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });

        // Create wallet debit ledger entry
        const walletTx = await tx.canteenWalletTransaction.create({
          data: {
            walletId: wallet.id,
            type: CanteenWalletTransType.DEBIT,
            amount: payAmount,
            referenceType: CanteenWalletRefType.ORDER_PAYMENT,
            referenceId: orderId,
            balanceAfter: newBalance,
            createdBy: staffUserId,
          },
        });

        transactionRef = `WLT-TXN-${walletTx.id}`;
      }

      // Record Payment
      const payment = await tx.canteenPayment.create({
        data: {
          orderId,
          paymentMode: dto.paymentMode,
          amount: payAmount,
          transactionRef,
          status: 'success',
          receivedBy: staffUserId,
        },
      });

      // Calculate new total payments
      const newTotalPaid = successfulPaymentsTotal + payAmount;
      const isFullyPaid = newTotalPaid >= Number(order.totalAmount) - 0.01;

      await tx.canteenOrder.update({
        where: { id: orderId },
        data: {
          paymentStatus: isFullyPaid ? CanteenPaymentStatus.PAID : CanteenPaymentStatus.UNPAID,
          status: isFullyPaid && order.status === CanteenOrderStatus.PLACED ? CanteenOrderStatus.PREPARING : order.status,
        },
      });

      await this.auditService.log({
        userId: staffUserId,
        entityType: 'CanteenPayment',
        entityId: payment.id,
        action: 'Canteen Payment Recorded',
        metadata: {
          orderId,
          mode: dto.paymentMode,
          amount: payAmount,
          isFullyPaid,
        },
      });

      return payment;
    });
  }

  async getPaymentsByOrder(orderId: string) {
    return this.prisma.canteenPayment.findMany({
      where: { orderId },
      include: { receiver: { select: { id: true, name: true, email: true } } },
      orderBy: { paidAt: 'desc' },
    });
  }

  async getPaymentById(id: string) {
    const payment = await this.prisma.canteenPayment.findUnique({
      where: { id },
      include: {
        order: { include: { member: { include: { wallet: true } } } },
        receiver: { select: { id: true, name: true, email: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException('Payment record not found.');
    }
    return payment;
  }

  async refundPayment(id: string, dto: RefundCanteenPaymentDto, actorUserId?: string) {
    const payment = await this.getPaymentById(id);

    if (payment.status === 'refunded') {
      throw new BadRequestException('Payment has already been refunded.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Reversal for WALLET payment
      if (payment.paymentMode === CanteenPaymentMode.WALLET) {
        const wallet = payment.order.member?.wallet;
        if (wallet) {
          const currentBalance = Number(wallet.balance);
          const refundAmt = Number(payment.amount);
          const newBalance = currentBalance + refundAmt;

          await tx.canteenWallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance },
          });

          await tx.canteenWalletTransaction.create({
            data: {
              walletId: wallet.id,
              type: CanteenWalletTransType.CREDIT,
              amount: refundAmt,
              referenceType: CanteenWalletRefType.REFUND,
              referenceId: payment.id,
              balanceAfter: newBalance,
              createdBy: actorUserId,
            },
          });
        }
      }

      // Mark payment status refunded
      const updatedPayment = await tx.canteenPayment.update({
        where: { id },
        data: { status: 'refunded' },
      });

      // Update Order Payment Status
      await tx.canteenOrder.update({
        where: { id: payment.orderId },
        data: { paymentStatus: CanteenPaymentStatus.REFUNDED },
      });

      await this.auditService.log({
        userId: actorUserId,
        entityType: 'CanteenPayment',
        entityId: id,
        action: 'Canteen Payment Refunded',
        reason: dto.reason || 'Payment refund processed',
        metadata: { amount: payment.amount, mode: payment.paymentMode },
      });

      return updatedPayment;
    });
  }
}
