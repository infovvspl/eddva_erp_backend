import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { CanteenAuditService } from '../common/canteen-audit.service';
import { NumberingService } from '../../numbering/numbering.service';
import { CreateCanteenOrderDto } from './dto/create-canteen-order.dto';
import { UpdateCanteenOrderDto } from './dto/update-canteen-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CanteenOrderItemDto } from './dto/canteen-order-item.dto';
import { CanteenOrderStatus, CanteenPaymentStatus, DocumentType } from '@prisma/client';

@Injectable()
export class CanteenOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: CanteenAuditService,
    private readonly numberingService: NumberingService,
  ) {}

  async createOrder(instituteId: string, dto: CreateCanteenOrderDto, staffUserId: string) {
    const instId = requireInstituteId(instituteId);
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item.');
    }

    if (dto.terminalId) {
      const terminal = await this.prisma.canteenPosTerminal.findFirst({
        where: { id: dto.terminalId, instituteId: instId },
      });
      if (!terminal) {
        throw new NotFoundException('POS terminal not found.');
      }
    }

    if (dto.memberId) {
      const member = await this.prisma.canteenMember.findFirst({
        where: { id: dto.memberId, instituteId: instId },
      });
      if (!member) {
        throw new NotFoundException('Member profile not found.');
      }
    }

    const itemIds = dto.items.map((i) => i.itemId);
    const dbItems = await this.prisma.canteenMenuItem.findMany({
      where: { id: { in: itemIds }, instituteId: instId },
    });

    if (dbItems.length !== itemIds.length) {
      throw new NotFoundException('One or more menu items were not found.');
    }

    const itemMap = new Map(dbItems.map((item) => [item.id, item]));

    // Verify item availability and calculate backend-only financials
    let subtotal = 0;
    let taxAmount = 0;
    const processedItems: {
      itemId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];

    for (const line of dto.items) {
      const item = itemMap.get(line.itemId)!;
      if (!item.isAvailable) {
        throw new BadRequestException(`Menu item '${item.name}' is currently unavailable.`);
      }
      if (line.quantity <= 0) {
        throw new BadRequestException(`Quantity for '${item.name}' must be greater than 0.`);
      }

      const price = Number(item.price);
      const taxRate = Number(item.taxRate || 0);
      const itemSubtotal = price * line.quantity;
      const itemTax = itemSubtotal * (taxRate / 100);

      subtotal += itemSubtotal;
      taxAmount += itemTax;

      processedItems.push({
        itemId: item.id,
        quantity: line.quantity,
        unitPrice: price,
        subtotal: itemSubtotal,
      });
    }

    const discountAmount = Number(dto.discountAmount || 0);
    if (discountAmount > subtotal + taxAmount) {
      throw new BadRequestException('Discount amount cannot exceed total subtotal + tax.');
    }

    const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);

    return this.prisma.$transaction(async (tx) => {
      // Generate unique order number. The counter itself is shared across every institute
      // (see NumberingService), but it is atomic and strictly increasing, so two institutes
      // never collide even though the per-institute uniqueness this column now enforces
      // isn't the thing preventing the collision.
      const orderNumber = await this.numberingService.generateNextNumber(
        DocumentType.CANTEEN_ORDER,
        new Date(),
        tx,
      );
      const uniqueOrderNo = `CNT-${orderNumber}`;

      const order = await tx.canteenOrder.create({
        data: {
          instituteId: instId,
          orderNumber: uniqueOrderNo,
          memberId: dto.memberId || null,
          terminalId: dto.terminalId || null,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          status: CanteenOrderStatus.PLACED,
          paymentStatus: CanteenPaymentStatus.UNPAID,
          createdBy: staffUserId,
          items: {
            create: processedItems.map((pi) => ({
              instituteId: instId,
              itemId: pi.itemId,
              quantity: pi.quantity,
              unitPrice: pi.unitPrice,
              subtotal: pi.subtotal,
            })),
          },
        },
        include: {
          items: { include: { item: true } },
          member: true,
          terminal: true,
          payments: true,
        },
      });

      await this.auditService.log({
        userId: staffUserId,
        entityType: 'CanteenOrder',
        entityId: order.id,
        action: 'Canteen Order Created',
        metadata: { orderNumber: order.orderNumber, totalAmount: order.totalAmount },
      });

      return order;
    });
  }

  async getOrders(instituteId: string, params: {
    page?: number;
    limit?: number;
    search?: string;
    memberId?: string;
    terminalId?: string;
    status?: CanteenOrderStatus;
    paymentStatus?: CanteenPaymentStatus;
    dateFrom?: string;
    dateTo?: string;
    sort?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { instituteId: requireInstituteId(instituteId) };

    if (params.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { member: { name: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    if (params.memberId) where.memberId = params.memberId;
    if (params.terminalId) where.terminalId = params.terminalId;
    if (params.status) where.status = params.status;
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus;

    if (params.dateFrom || params.dateTo) {
      where.orderDate = {};
      if (params.dateFrom) where.orderDate.gte = new Date(params.dateFrom);
      if (params.dateTo) where.orderDate.lte = new Date(params.dateTo);
    }

    const orderBy: any = {};
    if (params.sort) {
      const [field, direction] = params.sort.split(':');
      orderBy[field] = direction?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [total, data] = await Promise.all([
      this.prisma.canteenOrder.count({ where }),
      this.prisma.canteenOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          items: { include: { item: true } },
          member: true,
          terminal: true,
          payments: true,
        },
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrderById(instituteId: string, id: string) {
    const order = await this.prisma.canteenOrder.findFirst({
      where: { id, instituteId: requireInstituteId(instituteId) },
      include: {
        items: { include: { item: true } },
        member: true,
        terminal: true,
        payments: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Canteen order not found.');
    }
    return order;
  }

  async updateOrder(instituteId: string, id: string, dto: UpdateCanteenOrderDto, actorUserId?: string) {
    const instId = requireInstituteId(instituteId);
    const order = await this.getOrderById(instId, id);

    if (order.paymentStatus === CanteenPaymentStatus.PAID || order.status === CanteenOrderStatus.COMPLETED) {
      throw new BadRequestException('Paid or completed orders cannot be modified.');
    }

    if (order.status === CanteenOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be modified.');
    }

    // Validate member if provided
    if (dto.memberId) {
      const member = await this.prisma.canteenMember.findFirst({
        where: { id: dto.memberId, instituteId: instId },
      });
      if (!member) {
        throw new NotFoundException('Member profile not found.');
      }
    }

    // Validate terminal if provided
    if (dto.terminalId) {
      const terminal = await this.prisma.canteenPosTerminal.findFirst({
        where: { id: dto.terminalId, instituteId: instId },
      });
      if (!terminal) {
        throw new NotFoundException('POS terminal not found.');
      }
    }

    // Validate and process items if provided
    let processedItems: {
      itemId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];
    let subtotal = 0;
    let taxAmount = 0;

    if (dto.items && dto.items.length > 0) {
      const itemIds = dto.items.map((i) => i.itemId);
      const dbItems = await this.prisma.canteenMenuItem.findMany({
        where: { id: { in: itemIds }, instituteId: instId },
      });

      if (dbItems.length !== itemIds.length) {
        throw new NotFoundException('One or more menu items were not found.');
      }

      const itemMap = new Map(dbItems.map((item) => [item.id, item]));

      for (const line of dto.items) {
        const item = itemMap.get(line.itemId)!;
        if (!item.isAvailable) {
          throw new BadRequestException(`Menu item '${item.name}' is currently unavailable.`);
        }
        if (line.quantity <= 0) {
          throw new BadRequestException(`Quantity for '${item.name}' must be greater than 0.`);
        }

        const price = Number(item.price);
        const taxRate = Number(item.taxRate || 0);
        const itemSubtotal = price * line.quantity;
        const itemTax = itemSubtotal * (taxRate / 100);

        subtotal += itemSubtotal;
        taxAmount += itemTax;

        processedItems.push({
          itemId: item.id,
          quantity: line.quantity,
          unitPrice: price,
          subtotal: itemSubtotal,
        });
      }
    }

    const discountAmount = Number(dto.discountAmount ?? order.discountAmount);
    const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);

    return this.prisma.$transaction(async (tx) => {
      // Update order fields
      const updateData: any = {};
      if (dto.memberId !== undefined) updateData.memberId = dto.memberId || null;
      if (dto.terminalId !== undefined) updateData.terminalId = dto.terminalId || null;
      if (dto.discountAmount !== undefined) updateData.discountAmount = discountAmount;

      // If items are provided, replace all items
      if (processedItems) {
        await tx.canteenOrderItem.deleteMany({ where: { orderId: id } });
        updateData.subtotal = subtotal;
        updateData.taxAmount = taxAmount;
        updateData.totalAmount = totalAmount;
      }

      const updated = await tx.canteenOrder.update({
        where: { id },
        data: {
          ...updateData,
          ...(processedItems && {
            items: {
              create: processedItems.map((pi) => ({
                instituteId: instId,
                itemId: pi.itemId,
                quantity: pi.quantity,
                unitPrice: pi.unitPrice,
                subtotal: pi.subtotal,
              })),
            },
          }),
        },
        include: {
          items: { include: { item: true } },
          member: true,
          terminal: true,
          payments: true,
        },
      });

      await this.auditService.log({
        userId: actorUserId,
        entityType: 'CanteenOrder',
        entityId: id,
        action: 'Canteen Order Updated',
        metadata: { orderNumber: order.orderNumber },
      });

      return updated;
    });
  }

  async updateOrderStatus(instituteId: string, id: string, dto: UpdateOrderStatusDto, actorUserId?: string) {
    const order = await this.getOrderById(instituteId, id);

    if (order.status === CanteenOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be modified.');
    }

    if (order.status === CanteenOrderStatus.COMPLETED && dto.status !== CanteenOrderStatus.COMPLETED) {
      throw new BadRequestException('Completed orders status cannot be reverted.');
    }

    const updated = await this.prisma.canteenOrder.update({
      where: { id },
      data: { status: dto.status },
      include: {
        items: { include: { item: true } },
        member: true,
        terminal: true,
        payments: true,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenOrder',
      entityId: id,
      action: 'Canteen Order Status Updated',
      oldStatus: order.status,
      newStatus: dto.status,
      metadata: { orderNumber: order.orderNumber },
    });

    return updated;
  }

  async cancelOrder(instituteId: string, id: string, actorUserId?: string) {
    const order = await this.getOrderById(instituteId, id);

    if (order.status === CanteenOrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled.');
    }

    if (order.paymentStatus === CanteenPaymentStatus.PAID) {
      throw new BadRequestException('Paid orders cannot be cancelled directly. Process a refund first.');
    }

    const cancelled = await this.prisma.canteenOrder.update({
      where: { id },
      data: { status: CanteenOrderStatus.CANCELLED },
      include: {
        items: { include: { item: true } },
        member: true,
        terminal: true,
        payments: true,
      },
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenOrder',
      entityId: id,
      action: 'Canteen Order Cancelled',
      oldStatus: order.status,
      newStatus: 'CANCELLED',
      metadata: { orderNumber: order.orderNumber },
    });

    return cancelled;
  }

  // --- Order Items Management ---
  async getOrderItems(instituteId: string, orderId: string) {
    await this.getOrderById(instituteId, orderId);
    return this.prisma.canteenOrderItem.findMany({
      where: { orderId },
      include: { item: true },
    });
  }

  async addOrderItem(instituteId: string, orderId: string, dto: CanteenOrderItemDto, actorUserId?: string) {
    const instId = requireInstituteId(instituteId);
    const order = await this.getOrderById(instId, orderId);

    if (order.paymentStatus === CanteenPaymentStatus.PAID || order.status === CanteenOrderStatus.COMPLETED) {
      throw new BadRequestException('Historical paid/completed orders cannot be modified.');
    }

    const menuItem = await this.prisma.canteenMenuItem.findFirst({
      where: { id: dto.itemId, instituteId: instId },
    });

    if (!menuItem || !menuItem.isAvailable) {
      throw new BadRequestException('Menu item is not available.');
    }

    const price = Number(menuItem.price);
    const itemSubtotal = price * dto.quantity;

    const newItem = await this.prisma.$transaction(async (tx) => {
      const added = await tx.canteenOrderItem.create({
        data: {
          instituteId: instId,
          orderId,
          itemId: dto.itemId,
          quantity: dto.quantity,
          unitPrice: price,
          subtotal: itemSubtotal,
        },
        include: { item: true },
      });

      // Recalculate order totals
      const allItems = await tx.canteenOrderItem.findMany({ where: { orderId }, include: { item: true } });
      const newSubtotal = allItems.reduce((acc, i) => acc + Number(i.subtotal), 0);
      const newTax = allItems.reduce((acc, i) => acc + Number(i.subtotal) * (Number(i.item.taxRate || 0) / 100), 0);
      const newTotal = Math.max(0, newSubtotal + newTax - Number(order.discountAmount));

      await tx.canteenOrder.update({
        where: { id: orderId },
        data: {
          subtotal: newSubtotal,
          taxAmount: newTax,
          totalAmount: newTotal,
        },
      });

      return added;
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenOrderItem',
      entityId: newItem.id,
      action: 'Canteen Order Item Added',
      metadata: { orderId, itemId: dto.itemId, quantity: dto.quantity },
    });

    return newItem;
  }

  async updateOrderItem(instituteId: string, orderId: string, orderItemId: string, quantity: number, actorUserId?: string) {
    const instId = requireInstituteId(instituteId);
    const order = await this.getOrderById(instId, orderId);

    if (order.paymentStatus === CanteenPaymentStatus.PAID || order.status === CanteenOrderStatus.COMPLETED) {
      throw new BadRequestException('Historical paid/completed orders cannot be modified.');
    }

    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0.');
    }

    const orderItem = await this.prisma.canteenOrderItem.findFirst({
      where: { id: orderItemId, orderId },
      include: { item: true },
    });

    if (!orderItem) {
      throw new NotFoundException('Order line item not found.');
    }

    const price = Number(orderItem.unitPrice);
    const itemSubtotal = price * quantity;

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.canteenOrderItem.update({
        where: { id: orderItem.id },
        data: {
          quantity,
          subtotal: itemSubtotal,
        },
        include: { item: true },
      });

      const allItems = await tx.canteenOrderItem.findMany({
        where: { orderId },
        include: { item: true },
      });
      const newSubtotal = allItems.reduce((acc, i) => acc + Number(i.subtotal), 0);
      const newTax = allItems.reduce((acc, i) => acc + Number(i.subtotal) * (Number(i.item.taxRate || 0) / 100), 0);
      const newTotal = Math.max(0, newSubtotal + newTax - Number(order.discountAmount));

      await tx.canteenOrder.update({
        where: { id: orderId },
        data: {
          subtotal: newSubtotal,
          taxAmount: newTax,
          totalAmount: newTotal,
        },
      });

      await this.auditService.log({
        userId: actorUserId,
        entityType: 'CanteenOrderItem',
        entityId: updatedItem.id,
        action: 'Canteen Order Item Updated',
        metadata: { orderId, itemId: orderItem.itemId, newQuantity: quantity },
      });

      return updatedItem;
    });
  }

  async removeOrderItem(instituteId: string, orderId: string, orderItemId: string, actorUserId?: string) {
    const instId = requireInstituteId(instituteId);
    const order = await this.getOrderById(instId, orderId);

    if (order.paymentStatus === CanteenPaymentStatus.PAID || order.status === CanteenOrderStatus.COMPLETED) {
      throw new BadRequestException('Historical paid/completed orders cannot be modified.');
    }

    const orderItem = await this.prisma.canteenOrderItem.findFirst({
      where: { id: orderItemId, orderId },
    });

    if (!orderItem) {
      throw new NotFoundException('Order line item not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.canteenOrderItem.delete({ where: { id: orderItem.id } });

      const allItems = await tx.canteenOrderItem.findMany({
        where: { orderId },
        include: { item: true },
      });
      const newSubtotal = allItems.reduce((acc, i) => acc + Number(i.subtotal), 0);
      const newTax = allItems.reduce((acc, i) => acc + Number(i.subtotal) * (Number(i.item.taxRate || 0) / 100), 0);
      const newTotal = Math.max(0, newSubtotal + newTax - Number(order.discountAmount));

      await tx.canteenOrder.update({
        where: { id: orderId },
        data: {
          subtotal: newSubtotal,
          taxAmount: newTax,
          totalAmount: newTotal,
        },
      });
    });

    await this.auditService.log({
      userId: actorUserId,
      entityType: 'CanteenOrderItem',
      entityId: orderItem.id,
      action: 'Canteen Order Item Removed',
      metadata: { orderId, itemId: orderItem.itemId },
    });

    return { message: 'Order item removed successfully.' };
  }
}
