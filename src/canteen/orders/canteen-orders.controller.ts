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
import { CanteenOrdersService } from './canteen-orders.service';
import { CreateCanteenOrderDto } from './dto/create-canteen-order.dto';
import { UpdateCanteenOrderDto } from './dto/update-canteen-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CanteenOrderItemDto } from './dto/canteen-order-item.dto';
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { CanteenOrderStatus, CanteenPaymentStatus } from '@prisma/client';

@ApiTags('Canteen Orders Management')
@ApiBearerAuth()
@UseGuards(
  CanteenJwtGuard,
  CanteenInstituteAdminViewOnlyGuard,
  CanteenPermissionsGuard,
)
@Controller('api/canteen/orders')
export class CanteenOrdersController {
  constructor(private readonly ordersService: CanteenOrdersService) {}

  @ApiOperation({ summary: 'Create Canteen order' })
  @RequirePermission({ resource: 'orders', action: 'create' })
  @Post()
  async createOrder(@Body() dto: CreateCanteenOrderDto, @CanteenUser() user: CanteenPlatformUser) {
    return this.ordersService.createOrder(dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'List Canteen orders' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'memberId', required: false })
  @ApiQuery({ name: 'terminalId', required: false })
  @ApiQuery({ name: 'status', enum: CanteenOrderStatus, required: false })
  @ApiQuery({ name: 'paymentStatus', enum: CanteenPaymentStatus, required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @RequirePermission({ resource: 'orders', action: 'read' })
  @Get()
  async getOrders(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('memberId') memberId?: string,
    @Query('terminalId') terminalId?: string,
    @Query('status') status?: CanteenOrderStatus,
    @Query('paymentStatus') paymentStatus?: CanteenPaymentStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sort') sort?: string,
  ) {
    return this.ordersService.getOrders({
      page,
      limit,
      search,
      memberId,
      terminalId,
      status,
      paymentStatus,
      dateFrom,
      dateTo,
      sort,
    });
  }

  @ApiOperation({ summary: 'Get Canteen order by ID' })
  @RequirePermission({ resource: 'orders', action: 'read' })
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return this.ordersService.getOrderById(id);
  }

  @ApiOperation({ summary: 'Update Canteen order (items, member, terminal, discount)' })
  @RequirePermission({ resource: 'orders', action: 'update' })
  @Patch(':id')
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenOrderDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.ordersService.updateOrder(id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Update Canteen order status only' })
  @RequirePermission({ resource: 'orders', action: 'update' })
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.ordersService.updateOrderStatus(id, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Cancel Canteen order' })
  @RequirePermission({ resource: 'orders', action: 'cancel' })
  @Delete(':id')
  async cancelOrder(@Param('id') id: string, @CanteenUser() user: CanteenPlatformUser) {
    return this.ordersService.cancelOrder(id, user.eddva_user_id);
  }

  // --- Order Items ---
  @ApiOperation({ summary: 'Get line items for order' })
  @RequirePermission({ resource: 'order_items', action: 'read' })
  @Get(':orderId/items')
  async getOrderItems(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderItems(orderId);
  }

  @ApiOperation({ summary: 'Add item to unpaid order' })
  @RequirePermission({ resource: 'order_items', action: 'create' })
  @Post(':orderId/items')
  async addOrderItem(
    @Param('orderId') orderId: string,
    @Body() dto: CanteenOrderItemDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.ordersService.addOrderItem(orderId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Update item quantity on unpaid order' })
  @RequirePermission({ resource: 'order_items', action: 'update' })
  @Patch(':orderId/items/:itemId')
  async updateOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body('quantity') quantity: number,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.ordersService.updateOrderItem(orderId, itemId, quantity, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Remove item from unpaid order' })
  @RequirePermission({ resource: 'order_items', action: 'delete' })
  @Delete(':orderId/items/:itemId')
  async removeOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.ordersService.removeOrderItem(orderId, itemId, user.eddva_user_id);
  }
}
