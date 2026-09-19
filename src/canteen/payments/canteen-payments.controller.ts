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
import { CanteenJwtGuard } from '../auth/canteen-jwt.guard';
import { CanteenInstituteAdminViewOnlyGuard } from '../auth/canteen-institute-admin-view-only.guard';
import { CanteenPermissionsGuard } from '../auth/canteen-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { CanteenUser } from '../auth/canteen-user.decorator';
import type { CanteenPlatformUser } from '../auth/canteen-auth.service';

@ApiTags('Canteen Payments Management')
@ApiBearerAuth()
@UseGuards(
  CanteenJwtGuard,
  CanteenInstituteAdminViewOnlyGuard,
  CanteenPermissionsGuard,
)
@Controller('api/canteen')
export class CanteenPaymentsController {
  constructor(private readonly paymentsService: CanteenPaymentsService) {}

  @ApiOperation({ summary: 'Process payment for Canteen order' })
  @RequirePermission({ resource: 'payments', action: 'create' })
  @Post('orders/:orderId/payments')
  async processPayment(
    @Param('orderId') orderId: string,
    @Body() dto: CreateCanteenPaymentDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.paymentsService.processPayment(orderId, dto, user.eddva_user_id);
  }

  @ApiOperation({ summary: 'Get payment records for order' })
  @RequirePermission({ resource: 'payments', action: 'read' })
  @Get('orders/:orderId/payments')
  async getPaymentsByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentsByOrder(orderId);
  }

  @ApiOperation({ summary: 'Get payment record details' })
  @RequirePermission({ resource: 'payments', action: 'read' })
  @Get('payments/:id')
  async getPaymentById(@Param('id') id: string) {
    return this.paymentsService.getPaymentById(id);
  }

  @ApiOperation({ summary: 'Refund/Reverse payment transaction' })
  @RequirePermission({ resource: 'payments', action: 'refund' })
  @Delete('payments/:id')
  async refundPayment(
    @Param('id') id: string,
    @Body() dto: RefundCanteenPaymentDto,
    @CanteenUser() user: CanteenPlatformUser,
  ) {
    return this.paymentsService.refundPayment(id, dto, user.eddva_user_id);
  }
}
