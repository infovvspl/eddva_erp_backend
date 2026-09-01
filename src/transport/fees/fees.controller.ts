import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { TransportJwtGuard } from '../auth/transport-jwt.guard';
import { TransportInstituteAdminViewOnlyGuard } from '../auth/transport-institute-admin-view-only.guard';
import { TransportPermissionsGuard } from '../auth/transport-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { TransportUser } from '../auth/transport-user.decorator';
import type { TransportPlatformUser } from '../auth/transport-auth.service';
import { FeesService } from './fees.service';
import { CreateFeePlanDto } from './dto/create-fee-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@ApiTags('Transport / Fees')
@ApiBearerAuth()
@UseGuards(TransportJwtGuard, TransportInstituteAdminViewOnlyGuard, TransportPermissionsGuard)
@Controller('api/transport/fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Post('plans')
  @RequirePermission({ resource: 'fees', action: 'manage' })
  @ApiOperation({ summary: 'Create a transport fee plan' })
  createFeePlan(@Body() dto: CreateFeePlanDto, @TransportUser() user: TransportPlatformUser) {
    return this.feesService.createFeePlan(user.institute_id, dto, user.eddva_user_id);
  }

  @Get('plans')
  @RequirePermission({ resource: 'fees', action: 'view' })
  @ApiOperation({ summary: 'List transport fee plans' })
  getFeePlans(@TransportUser() user: TransportPlatformUser) {
    return this.feesService.getFeePlans(user.institute_id);
  }

  @Post('passengers/:passengerId/subscriptions/:planId')
  @RequirePermission({ resource: 'fees', action: 'manage' })
  @ApiOperation({ summary: 'Subscribe a passenger to a fee plan' })
  @ApiParam({ name: 'passengerId', example: 1 })
  @ApiParam({ name: 'planId', example: 1 })
  subscribePassenger(
    @TransportUser() user: TransportPlatformUser,
    @Param('passengerId', ParseIntPipe) passengerId: number,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.feesService.createSubscription(user.institute_id, passengerId, planId, dto, user.eddva_user_id);
  }

  @Get('passengers/:passengerId/subscriptions')
  @RequirePermission({ resource: 'fees', action: 'view' })
  @ApiOperation({ summary: 'Get all fee subscriptions for a passenger' })
  @ApiParam({ name: 'passengerId', example: 1 })
  getSubscriptions(@TransportUser() user: TransportPlatformUser, @Param('passengerId', ParseIntPipe) passengerId: number) {
    return this.feesService.getPassengerSubscriptions(user.institute_id, passengerId);
  }

  @Post('subscriptions/:subscriptionId/payments')
  @RequirePermission({ resource: 'fees', action: 'manage' })
  @ApiOperation({ summary: 'Record a payment against a transport subscription' })
  @ApiParam({ name: 'subscriptionId', example: 1 })
  recordPayment(@TransportUser() user: TransportPlatformUser, @Param('subscriptionId', ParseIntPipe) subscriptionId: number, @Body() dto: RecordPaymentDto) {
    return this.feesService.recordPayment(user.institute_id, subscriptionId, dto, user.eddva_user_id);
  }

  @Get('subscriptions/:subscriptionId/payments')
  @RequirePermission({ resource: 'fees', action: 'view' })
  @ApiOperation({ summary: 'Get payment history for a subscription' })
  @ApiParam({ name: 'subscriptionId', example: 1 })
  getPayments(@TransportUser() user: TransportPlatformUser, @Param('subscriptionId', ParseIntPipe) subscriptionId: number) {
    return this.feesService.getPayments(user.institute_id, subscriptionId);
  }
}
