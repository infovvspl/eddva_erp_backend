import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PurchaseService } from './purchase.service';
import { MatchService } from './match.service';
import { PdfService } from '../pdf/pdf.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ApprovalActionDto,
} from './dto/purchase-order.dto';
import { CreateGrnDto, UpdateGrnDto } from './dto/grn.dto';
import {
  CreatePurchaseInvoiceDto,
  UpdatePurchaseInvoiceDto,
  CreatePurchasePaymentDto,
  UpdatePurchasePaymentDto,
} from './dto/purchase-invoice.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Purchase Workflow (PO, GRN, Invoices, Payments)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api')
export class PurchaseController {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly matchService: MatchService,
    private readonly pdfService: PdfService,
  ) {}

  // --- Purchase Orders ---
  @ApiOperation({ summary: 'Create draft Purchase Order' })
  @RequirePermission('purchase_order.create')
  @Post('purchase-orders')
  createPo(@Body() dto: CreatePurchaseOrderDto, @GetUser() user: any) {
    return this.purchaseService.createPo(dto, user);
  }

  @ApiOperation({ summary: 'List Purchase Orders' })
  @RequirePermission('purchase_order.view')
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'poNumber', required: false })
  @Get('purchase-orders')
  getPos(
    @Query() query: PaginationQueryDto,
    @GetUser() user: any,
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('poNumber') poNumber?: string,
  ) {
    return this.purchaseService.getPos({ ...query, vendorId, status, dateFrom, dateTo, poNumber }, user);
  }

  @ApiOperation({ summary: 'Get Purchase Order details by ID' })
  @RequirePermission('purchase_order.view')
  @Get('purchase-orders/:id')
  getPoById(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.getPoById(id, user);
  }

  @ApiOperation({ summary: 'Submit Purchase Order for approval' })
  @RequirePermission('purchase_order.submit')
  @Post('purchase-orders/:id/submit')
  submitPo(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.submitPo(id, user);
  }

  @ApiOperation({ summary: 'Approve Purchase Order' })
  @RequirePermission('purchase_order.approve')
  @Post('purchase-orders/:id/approve')
  approvePo(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.purchaseService.approvePo(id, user, dto);
  }

  @ApiOperation({ summary: 'Reject Purchase Order' })
  @RequirePermission('purchase_order.reject')
  @Post('purchase-orders/:id/reject')
  rejectPo(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.purchaseService.rejectPo(id, user, dto);
  }

  @ApiOperation({ summary: 'Cancel Purchase Order' })
  @RequirePermission('purchase_order.cancel')
  @Post('purchase-orders/:id/cancel')
  cancelPo(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.cancelPo(id, user);
  }

  @ApiOperation({ summary: 'Update draft Purchase Order' })
  @RequirePermission('purchase_order.edit')
  @Patch('purchase-orders/:id')
  updatePo(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @GetUser() user: any,
  ) {
    return this.purchaseService.updatePo(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete draft Purchase Order' })
  @RequirePermission('purchase_order.edit')
  @Delete('purchase-orders/:id')
  deletePo(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.deletePo(id, user);
  }

  @ApiOperation({ summary: 'Get Purchase Order approval & audit history' })
  @RequirePermission('purchase_order.view')
  @Get('purchase-orders/:id/history')
  getPoHistory(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.getPoHistory(id, user);
  }

  // --- GRN ---
  @ApiOperation({ summary: 'Create draft GRN' })
  @RequirePermission('grn.create')
  @Post('grn')
  createGrn(@Body() dto: CreateGrnDto, @GetUser() user: any) {
    return this.purchaseService.createGrn(dto, user);
  }

  @ApiOperation({ summary: 'Update draft GRN' })
  @RequirePermission('grn.create')
  @Patch('grn/:id')
  updateGrn(
    @Param('id') id: string,
    @Body() dto: UpdateGrnDto,
    @GetUser() user: any,
  ) {
    return this.purchaseService.updateGrn(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete draft GRN' })
  @RequirePermission('grn.cancel')
  @Delete('grn/:id')
  deleteGrn(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.deleteGrn(id, user);
  }

  @ApiOperation({ summary: 'List GRNs' })
  @RequirePermission('grn.view')
  @Get('grn')
  getGrns(@Query() query: PaginationQueryDto, @GetUser() user: any) {
    return this.purchaseService.getGrns(query, user);
  }

  @ApiOperation({ summary: 'Get GRN details by ID' })
  @RequirePermission('grn.view')
  @Get('grn/:id')
  getGrnById(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.getGrnById(id, user);
  }

  @ApiOperation({ summary: 'Confirm GRN' })
  @RequirePermission('grn.confirm')
  @Post('grn/:id/confirm')
  confirmGrn(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.confirmGrn(id, user);
  }

  @ApiOperation({ summary: 'Cancel GRN' })
  @RequirePermission('grn.cancel')
  @Post('grn/:id/cancel')
  cancelGrn(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.cancelGrn(id, user);
  }

  @ApiOperation({ summary: 'Get GRNs linked to a Purchase Order' })
  @RequirePermission('grn.view')
  @Get('purchase-orders/:id/grn')
  getPoGrns(@Param('id') poId: string, @GetUser() user: any) {
    return this.purchaseService.getPoGrns(poId, user);
  }

  // --- Purchase Invoices & 3-Way Matching ---
  @ApiOperation({ summary: 'Create draft Purchase Invoice' })
  @RequirePermission('purchase_invoice.create')
  @Post('purchase-invoices')
  createPurchaseInvoice(
    @Body() dto: CreatePurchaseInvoiceDto,
    @GetUser() user: any,
  ) {
    return this.purchaseService.createPurchaseInvoice(dto, user);
  }

  @ApiOperation({ summary: 'Update draft Purchase Invoice' })
  @RequirePermission('purchase_invoice.create')
  @Patch('purchase-invoices/:id')
  updatePurchaseInvoice(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
    @GetUser() user: any,
  ) {
    return this.purchaseService.updatePurchaseInvoice(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete draft Purchase Invoice' })
  @RequirePermission('purchase_invoice.cancel')
  @Delete('purchase-invoices/:id')
  deletePurchaseInvoice(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.deletePurchaseInvoice(id, user);
  }

  @ApiOperation({ summary: 'List Purchase Invoices' })
  @RequirePermission('purchase_invoice.view')
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @Get('purchase-invoices')
  getPurchaseInvoices(
    @Query() query: PaginationQueryDto,
    @GetUser() user: any,
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: any,
    @Query('paymentStatus') paymentStatus?: any,
  ) {
    return this.purchaseService.getPurchaseInvoices({ ...query, vendorId, status, paymentStatus }, user);
  }

  @ApiOperation({ summary: 'Get Purchase Invoice details by ID' })
  @RequirePermission('purchase_invoice.view')
  @Get('purchase-invoices/:id')
  getPurchaseInvoiceById(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.getPurchaseInvoiceById(id, user);
  }

  @ApiOperation({ summary: 'Download / View Puppeteer A4 PDF for Purchase Invoice' })
  @RequirePermission('purchase_invoice.view')
  @Get('purchase-invoices/:id/pdf')
  async getPurchaseInvoicePdf(@Param('id') id: string, @GetUser() user: any, @Res() res: any) {
    const invoice = await this.purchaseService.getPurchaseInvoiceById(id, user);
    const pdfBuffer = await this.pdfService.generateInvoicePdf('PURCHASE', invoice);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @ApiOperation({ summary: 'Validate 3-Way Matching for Purchase Invoice' })
  @RequirePermission('purchase_invoice.view')
  @Post('purchase-invoices/:id/validate')
  validatePurchaseInvoice(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.validatePurchaseInvoice(id, user);
  }

  @ApiOperation({ summary: 'Get 3-Way Matching result for Purchase Invoice' })
  @RequirePermission('purchase_invoice.view')
  @Get('purchase-invoices/:id/match-result')
  getMatchResult(@Param('id') id: string, @GetUser() user: any) {
    return this.matchService.matchPurchaseInvoice(id, user);
  }

  @ApiOperation({ summary: 'Post Purchase Invoice (Atomic transaction after 3-way match validation)' })
  @RequirePermission('purchase_invoice.post')
  @Post('purchase-invoices/:id/post')
  postPurchaseInvoice(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.purchaseService.postPurchaseInvoice(id, user);
  }

  @ApiOperation({ summary: 'Cancel Purchase Invoice' })
  @RequirePermission('purchase_invoice.cancel')
  @Post('purchase-invoices/:id/cancel')
  cancelPurchaseInvoice(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.purchaseService.cancelPurchaseInvoice(id, user);
  }

  // --- Purchase Payments ---
  @ApiOperation({ summary: 'Record Purchase Payment' })
  @RequirePermission('purchase_payment.create')
  @Post('purchase-payments')
  createPurchasePayment(
    @Body() dto: CreatePurchasePaymentDto,
    @GetUser() user: any,
  ) {
    return this.purchaseService.createPurchasePayment(dto, user);
  }

  @ApiOperation({ summary: 'List Purchase Payments' })
  @RequirePermission('purchase_payment.create')
  @Get('purchase-payments')
  getPurchasePayments(@Query() query: PaginationQueryDto, @GetUser() user: any) {
    return this.purchaseService.getPurchasePayments(query, user);
  }

  @ApiOperation({ summary: 'Get Purchase Payment by ID' })
  @RequirePermission('purchase_payment.create')
  @Get('purchase-payments/:id')
  getPurchasePaymentById(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.getPurchasePaymentById(id, user);
  }

  @ApiOperation({ summary: 'Update Purchase Payment' })
  @RequirePermission('purchase_payment.create')
  @Patch('purchase-payments/:id')
  updatePurchasePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePurchasePaymentDto,
    @GetUser() user: any,
  ) {
    return this.purchaseService.updatePurchasePayment(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete Purchase Payment' })
  @RequirePermission('purchase_payment.create')
  @Delete('purchase-payments/:id')
  deletePurchasePayment(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.deletePurchasePayment(id, user);
  }

  @ApiOperation({ summary: 'Void / Reverse Purchase Payment' })
  @RequirePermission('purchase_payment.create')
  @Post('purchase-payments/:id/void')
  voidPurchasePayment(@Param('id') id: string, @GetUser() user: any) {
    return this.purchaseService.voidPurchasePayment(id, user);
  }

  @ApiOperation({ summary: 'Get payments for a specific Purchase Invoice' })
  @RequirePermission('purchase_invoice.view')
  @Get('purchase-invoices/:id/payments')
  getInvoicePayments(@Param('id') purchaseInvoiceId: string, @GetUser() user: any) {
    return this.purchaseService.getInvoicePayments(purchaseInvoiceId, user);
  }
}
