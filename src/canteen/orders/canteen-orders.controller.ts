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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CanteenPermissionsGuard } from '../guards/canteen-permissions.guard';
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { CanteenOrderStatus, CanteenPaymentStatus } from '@prisma/client';

@ApiTags('Canteen Orders Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanteenPermissionsGuard)
@Controller('api/canteen/orders')
export class CanteenOrdersController {
  constructor(private readonly ordersService: CanteenOrdersService) {}

  @ApiOperation({ summary: 'Create Canteen order' })
  @RequireCanteenPermission('canteen.order.create')
  @Post()
  async createOrder(@Body() dto: CreateCanteenOrderDto, @GetUser() user: any) {
    return this.ordersService.createOrder(dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'List Canteen orders' })
  @RequireCanteenPermission('canteen.order.view')
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
  @RequireCanteenPermission('canteen.order.view')
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return this.ordersService.getOrderById(id);
  }

  @ApiOperation({ summary: 'Update Canteen order (items, member, terminal, discount)' })
  @RequireCanteenPermission('canteen.order.update')
  @Patch(':id')
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateCanteenOrderDto,
    @GetUser() user: any,
  ) {
    return this.ordersService.updateOrder(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Update Canteen order status only' })
  @RequireCanteenPermission('canteen.order.update')
  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @GetUser() user: any,
  ) {
    return this.ordersService.updateOrderStatus(id, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Cancel Canteen order' })
  @RequireCanteenPermission('canteen.order.cancel')
  @Delete(':id')
  async cancelOrder(@Param('id') id: string, @GetUser() user: any) {
    return this.ordersService.cancelOrder(id, user?.id || user?.userId);
  }

  // --- Order Items ---
  @ApiOperation({ summary: 'Get line items for order' })
  @RequireCanteenPermission('canteen.order_item.view')
  @Get(':orderId/items')
  async getOrderItems(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderItems(orderId);
  }

  @ApiOperation({ summary: 'Add item to unpaid order' })
  @RequireCanteenPermission('canteen.order_item.create')
  @Post(':orderId/items')
  async addOrderItem(
    @Param('orderId') orderId: string,
    @Body() dto: CanteenOrderItemDto,
    @GetUser() user: any,
  ) {
    return this.ordersService.addOrderItem(orderId, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Update item quantity on unpaid order' })
  @RequireCanteenPermission('canteen.order_item.update')
  @Patch(':orderId/items/:itemId')
  async updateOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body('quantity') quantity: number,
    @GetUser() user: any,
  ) {
    return this.ordersService.updateOrderItem(orderId, itemId, quantity, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Remove item from unpaid order' })
  @RequireCanteenPermission('canteen.order_item.delete')
  @Delete(':orderId/items/:itemId')
  async removeOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @GetUser() user: any,
  ) {
    return this.ordersService.removeOrderItem(orderId, itemId, user?.id || user?.userId);
  }
}
