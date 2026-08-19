import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CanteenPaymentsService } from './canteen-payments.service';
import { CreateCanteenPaymentDto } from './dto/create-canteen-payment.dto';
import { RefundCanteenPaymentDto } from './dto/refund-canteen-payment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CanteenPermissionsGuard } from '../guards/canteen-permissions.guard';
import { RequireCanteenPermission } from '../decorators/require-canteen-permission.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';

@ApiTags('Canteen Payments Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanteenPermissionsGuard)
@Controller('api/canteen')
export class CanteenPaymentsController {
  constructor(private readonly paymentsService: CanteenPaymentsService) {}

  @ApiOperation({ summary: 'Process payment for Canteen order' })
  @RequireCanteenPermission('canteen.payment.create')
  @Post('orders/:orderId/payments')
  async processPayment(
    @Param('orderId') orderId: string,
    @Body() dto: CreateCanteenPaymentDto,
    @GetUser() user: any,
  ) {
    return this.paymentsService.processPayment(orderId, dto, user?.id || user?.userId);
  }

  @ApiOperation({ summary: 'Get payment records for order' })
  @RequireCanteenPermission('canteen.payment.view')
  @Get('orders/:orderId/payments')
  async getPaymentsByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentsByOrder(orderId);
  }

  @ApiOperation({ summary: 'Get payment record details' })
  @RequireCanteenPermission('canteen.payment.view')
  @Get('payments/:id')
  async getPaymentById(@Param('id') id: string) {
    return this.paymentsService.getPaymentById(id);
  }

  @ApiOperation({ summary: 'Refund/Reverse payment transaction' })
  @RequireCanteenPermission('canteen.payment.refund')
  @Delete('payments/:id')
  async refundPayment(
    @Param('id') id: string,
    @Body() dto: RefundCanteenPaymentDto,
    @GetUser() user: any,
  ) {
    return this.paymentsService.refundPayment(id, dto, user?.id || user?.userId);
  }
}
