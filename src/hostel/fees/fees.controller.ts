import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { HostelJwtGuard } from '../auth/hostel-jwt.guard';
import { HostelInstituteAdminViewOnlyGuard } from '../auth/hostel-institute-admin-view-only.guard';
import { HostelPermissionsGuard } from '../auth/hostel-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { HostelUser } from '../auth/hostel-user.decorator';
import type { HostelPlatformUser } from '../auth/hostel-auth.service';
import { FeePlansService } from './fee-plans.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import {
  CancelHostelInvoiceDto,
  CreateHostelFeePlanDto,
  GenerateHostelInvoiceDto,
  QueryHostelFeePlanDto,
  QueryHostelInvoiceDto,
  QueryHostelPaymentDto,
  RecordHostelPaymentDto,
  UpdateHostelFeePlanDto,
} from './dto/fee.dto';

@ApiTags('Hostel / Fee Plans')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/fee-plans')
export class FeePlansController {
  constructor(private readonly svc: FeePlansService) {}

  @Post()
  @RequirePermission({ resource: 'fee_plans', action: 'create' })
  @ApiOperation({
    summary: 'Create a room-type fee plan (optionally bundling mess)',
  })
  create(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: CreateHostelFeePlanDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'fee_plans', action: 'read' })
  @ApiOperation({ summary: 'List fee plans (room type, cycle, mess, active)' })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelFeePlanDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'fee_plans', action: 'read' })
  @ApiOperation({ summary: 'Get a fee plan' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'fee_plans', action: 'update' })
  @ApiOperation({
    summary:
      'Update a plan or activate/deactivate it. Invoices already issued keep the amount they were generated with',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHostelFeePlanDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'fee_plans', action: 'delete' })
  @ApiOperation({
    summary: 'Soft-delete a plan (issued invoices are unaffected)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }
}

@ApiTags('Hostel / Fee Invoices')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel')
export class InvoicesController {
  constructor(
    private readonly svc: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('invoices')
  @RequirePermission({ resource: 'invoices', action: 'create' })
  @ApiOperation({
    summary:
      'Generate an invoice for a resident and billing period; the plan amount is frozen onto the invoice',
  })
  generate(
    @HostelUser() user: HostelPlatformUser,
    @Body() dto: GenerateHostelInvoiceDto,
  ) {
    return this.svc.generate(user, dto);
  }

  @Get('invoices')
  @RequirePermission({ resource: 'invoices', action: 'read' })
  @ApiOperation({
    summary:
      'List invoices — resident, payment status, billing period/cycle, block, period date range',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelInvoiceDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get('invoices/outstanding')
  @RequirePermission({ resource: 'invoices', action: 'read' })
  @ApiOperation({
    summary: 'Unpaid and partially paid invoices, earliest due first',
  })
  outstanding(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelInvoiceDto,
  ) {
    return this.svc.outstanding(user.institute_id, query);
  }

  @Get('invoices/due')
  @RequirePermission({ resource: 'invoices', action: 'read' })
  @ApiOperation({ summary: 'Outstanding invoices not yet past their due date' })
  due(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelInvoiceDto,
  ) {
    return this.svc.due(user.institute_id, query);
  }

  @Get('invoices/overdue')
  @RequirePermission({ resource: 'invoices', action: 'read' })
  @ApiOperation({ summary: 'Outstanding invoices past their due date' })
  overdue(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelInvoiceDto,
  ) {
    return this.svc.overdue(user.institute_id, query);
  }

  @Get('invoices/:id')
  @RequirePermission({ resource: 'invoices', action: 'read' })
  @ApiOperation({ summary: 'Get an invoice with its payments and balance' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Post('invoices/:id/cancel')
  @RequirePermission({ resource: 'invoices', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel an invoice that has no payments' })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelHostelInvoiceDto,
  ) {
    return this.svc.cancel(user, id, dto);
  }

  @Post('invoices/:id/payments')
  @RequirePermission({ resource: 'payments', action: 'create' })
  @ApiOperation({
    summary:
      'Record a payment. Amount must be > 0 and ≤ the outstanding balance; status becomes partially_paid / paid atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  recordPayment(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordHostelPaymentDto,
  ) {
    return this.payments.record(user, id, dto);
  }

  @Get('invoices/:id/payments')
  @RequirePermission({ resource: 'payments', action: 'read' })
  @ApiOperation({ summary: 'Payment history of one invoice' })
  @ApiParam({ name: 'id', example: 1 })
  invoicePayments(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryHostelPaymentDto,
  ) {
    return this.payments.forInvoice(user.institute_id, id, query);
  }

  @Get('residents/:id/invoices')
  @RequirePermission({ resource: 'invoices', action: 'read' })
  @ApiOperation({ summary: 'Invoice history of one resident' })
  @ApiParam({ name: 'id', example: 1 })
  residentInvoices(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryHostelInvoiceDto,
  ) {
    return this.svc.residentInvoices(user.institute_id, id, query);
  }

  @Get('residents/:id/payments')
  @RequirePermission({ resource: 'payments', action: 'read' })
  @ApiOperation({ summary: 'Payment history of one resident' })
  @ApiParam({ name: 'id', example: 1 })
  residentPayments(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryHostelPaymentDto,
  ) {
    return this.payments.forResident(user.institute_id, id, query);
  }
}

@ApiTags('Hostel / Fee Payments')
@ApiBearerAuth()
@UseGuards(
  HostelJwtGuard,
  HostelInstituteAdminViewOnlyGuard,
  HostelPermissionsGuard,
)
@Controller('api/hostel/payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get()
  @RequirePermission({ resource: 'payments', action: 'read' })
  @ApiOperation({
    summary: 'List payments (invoice, resident, mode, date range, receipt no)',
  })
  findAll(
    @HostelUser() user: HostelPlatformUser,
    @Query() query: QueryHostelPaymentDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'payments', action: 'read' })
  @ApiOperation({ summary: 'Get a payment' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }

  @Get(':id/receipt')
  @RequirePermission({ resource: 'payments', action: 'read' })
  @ApiOperation({
    summary:
      'Receipt details, incl. balance left on the invoice after this payment',
  })
  @ApiParam({ name: 'id', example: 1 })
  receipt(
    @HostelUser() user: HostelPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.receipt(user.institute_id, id);
  }
}
