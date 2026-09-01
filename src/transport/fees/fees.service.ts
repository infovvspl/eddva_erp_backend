import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';
import { TRANSPORT_ENTITY } from '../common/transport-entities';
import { CreateFeePlanDto } from './dto/create-fee-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TransportAuditService,
  ) {}

  // ─── Fee Plans ────────────────────────────────────────────────────────

  async createFeePlan(instituteId: string, dto: CreateFeePlanDto, actorId?: string) {
    if (dto.basis === 'route' && !dto.route_id) {
      throw new BadRequestException('route_id is required when basis is "route"');
    }
    if (dto.route_id) {
      const route = await this.prisma.transportRoute.findFirst({ where: { route_id: dto.route_id, institute_id: instituteId } });
      if (!route) throw new NotFoundException(`Route #${dto.route_id} not found`);
    }

    const plan = await this.prisma.transportFeePlan.create({
      data: { institute_id: instituteId, name: dto.name, basis: dto.basis as any, route_id: dto.route_id, amount: dto.amount, billing_cycle: dto.billing_cycle as any },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.FEE_PLAN, entityId: String(plan.fee_plan_id), action: 'create' });
    return plan;
  }

  async getFeePlans(instituteId: string) {
    return this.prisma.transportFeePlan.findMany({ where: { institute_id: instituteId }, orderBy: { name: 'asc' } });
  }

  private async assertPlanExists(instituteId: string, id: number) {
    const plan = await this.prisma.transportFeePlan.findFirst({ where: { fee_plan_id: id, institute_id: instituteId } });
    if (!plan) throw new NotFoundException(`Fee plan #${id} not found`);
    return plan;
  }

  // ─── Subscriptions ────────────────────────────────────────────────────

  async createSubscription(instituteId: string, passengerId: number, feePlanId: number, dto: CreateSubscriptionDto, actorId?: string) {
    const passenger = await this.prisma.transportPassenger.findFirst({ where: { passenger_id: passengerId, institute_id: instituteId } });
    if (!passenger) throw new NotFoundException(`Passenger #${passengerId} not found`);
    await this.assertPlanExists(instituteId, feePlanId);

    const subscription = await this.prisma.transportPassengerFeeSubscription.create({
      data: { passenger_id: passengerId, fee_plan_id: feePlanId, start_date: new Date(dto.start_date), status: (dto.status as any) ?? 'active' },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.FEE_SUBSCRIPTION, entityId: String(subscription.subscription_id), action: 'create', metadata: { passenger_id: passengerId, fee_plan_id: feePlanId } });
    return subscription;
  }

  async getPassengerSubscriptions(instituteId: string, passengerId: number) {
    const passenger = await this.prisma.transportPassenger.findFirst({ where: { passenger_id: passengerId, institute_id: instituteId } });
    if (!passenger) throw new NotFoundException(`Passenger #${passengerId} not found`);
    return this.prisma.transportPassengerFeeSubscription.findMany({ where: { passenger_id: passengerId }, include: { fee_plan: true }, orderBy: { start_date: 'desc' } });
  }

  private async assertSubscriptionExists(instituteId: string, id: number) {
    const subscription = await this.prisma.transportPassengerFeeSubscription.findFirst({
      where: { subscription_id: id, passenger: { institute_id: instituteId } },
    });
    if (!subscription) throw new NotFoundException(`Subscription #${id} not found`);
    return subscription;
  }

  // ─── Payments ─────────────────────────────────────────────────────────

  async recordPayment(instituteId: string, subscriptionId: number, dto: RecordPaymentDto, actorId?: string) {
    await this.assertSubscriptionExists(instituteId, subscriptionId);

    const payment = await this.prisma.transportFeePayment.create({
      data: {
        subscription_id: subscriptionId,
        amount_paid: dto.amount_paid,
        payment_date: new Date(dto.payment_date),
        payment_mode: dto.payment_mode as any,
        transaction_ref: dto.transaction_ref,
        invoice_id: dto.invoice_id,
      },
    });
    await this.audit.log({ userId: actorId, entityType: TRANSPORT_ENTITY.FEE_PAYMENT, entityId: String(payment.payment_id), action: 'create', metadata: { subscription_id: subscriptionId, amount_paid: dto.amount_paid } });
    return payment;
  }

  async getPayments(instituteId: string, subscriptionId: number) {
    await this.assertSubscriptionExists(instituteId, subscriptionId);
    return this.prisma.transportFeePayment.findMany({ where: { subscription_id: subscriptionId }, orderBy: { payment_date: 'desc' } });
  }
}
