import { BadRequestException, Controller, Get, Param, ParseIntPipe, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { AdmissionPaymentsService } from './admission-payments.service';
import { RazorpayService } from './razorpay.service';
import { computeFeeSummary } from '../common/admission-fee.util';
import { CreateRazorpayOrderDto, VerifyRazorpayPaymentDto } from './dto/public-payment.dto';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';

/**
 * No-login surface: the parent pays via a link shared after the offer is
 * accepted, never signs into the Admission platform. Every route here is
 * gated by application_id + application_number together (see
 * `AdmissionLookupService.applicationForPublicPayment`) rather than any
 * session — this is a lighter bar than a real auth check and is meant for
 * a test/demo Razorpay flow; a production deployment should hand the
 * parent a signed, single-use payment link instead of a guessable pair.
 */
@ApiTags('Admission / Public Fee Payment (no login)')
@Controller('api/admission/public/fees')
export class PublicPaymentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly payments: AdmissionPaymentsService,
    private readonly razorpay: RazorpayService,
  ) {}

  @Get(':applicationId/summary')
  @ApiOperation({ summary: 'Fee summary for the parent payment page' })
  @ApiParam({ name: 'applicationId', example: 42 })
  async summary(@Param('applicationId', ParseIntPipe) applicationId: number, @Query('application_number') applicationNumber: string) {
    if (!applicationNumber) throw new BadRequestException('application_number query param is required');
    const application = await this.lookup.applicationForPublicPayment(applicationId, applicationNumber);
    const summary = await computeFeeSummary(this.prisma, application);
    return {
      application_number: application.application_number,
      applicant_name: application.applicant.name,
      ...summary,
    };
  }

  @Post(':applicationId/create-order')
  @ApiOperation({ summary: 'Create a Razorpay order for the outstanding admission fee balance' })
  @ApiParam({ name: 'applicationId', example: 42 })
  async createOrder(@Param('applicationId', ParseIntPipe) applicationId: number, @Body() dto: CreateRazorpayOrderDto) {
    const application = await this.lookup.applicationForPublicPayment(applicationId, dto.application_number);
    const summary = await computeFeeSummary(this.prisma, application);

    if (!summary.fee_structure_configured) {
      throw new BadRequestException('No admission fee is configured for this program and session.');
    }
    if (summary.is_paid) {
      throw new BadRequestException('The admission fee has already been paid in full.');
    }

    const balance = Number(summary.balance);
    return this.razorpay.createOrder(balance, `adm-${application.application_id}-${Date.now()}`);
  }

  @Post(':applicationId/verify')
  @ApiOperation({ summary: 'Verify a Razorpay payment and record it against the admission fee' })
  @ApiParam({ name: 'applicationId', example: 42 })
  async verify(@Param('applicationId', ParseIntPipe) applicationId: number, @Body() dto: VerifyRazorpayPaymentDto) {
    const application = await this.lookup.applicationForPublicPayment(applicationId, dto.application_number);

    this.razorpay.verifySignature(dto.razorpay_order_id, dto.razorpay_payment_id, dto.razorpay_signature);
    // Never trust a client-supplied amount — read back what Razorpay actually captured.
    const amountPaid = await this.razorpay.fetchOrderAmount(dto.razorpay_order_id);

    const systemActor: AdmissionPlatformUser = {
      eddva_user_id: 'PARENT_SELF_CHECKOUT',
      institute_id: application.institute_id,
      user_name: 'Parent (online self-checkout)',
      user_role: 'PARENT',
      is_institute_admin: false,
    };

    const result = await this.payments.record(systemActor, applicationId, {
      amount_paid: amountPaid,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_mode: 'online',
      transaction_ref: dto.razorpay_payment_id,
      idempotency_key: dto.razorpay_payment_id,
    });

    return result;
  }
}
